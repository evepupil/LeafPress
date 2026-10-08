import { describe, expect, it } from "vitest";

import { LeafPressError } from "../../src/shared/errors.js";
import { createServerApp } from "../../src/server/app.js";
import { createFakeUseCases } from "./fake-usecases.js";
import { appRequest } from "./request.js";

function createApp(dev = false, usecases = createFakeUseCases()) {
  return createServerApp({ usecases, port: 3210, dev });
}

describe("本机访问 guard", () => {
  it("拒绝不匹配的 Host 和第三方 Origin", async () => {
    const app = createApp(true);
    const badHost = await appRequest(app, "/api/version", {
      headers: { Host: "example.test:3210" },
    });
    const badOrigin = await appRequest(app, "/api/version", {
      headers: { Origin: "https://example.test" },
    });
    const wrongDevPort = await appRequest(app, "/api/version", {
      headers: { Origin: "http://localhost:3212" },
    });
    const nullOrigin = await appRequest(app, "/api/version", {
      headers: { Origin: "null" },
    });
    const missingHost = await app.request(
      new Request("http://127.0.0.1:3210/api/version"),
    );

    expect(badHost.status).toBe(403);
    expect(badOrigin.status).toBe(403);
    expect(wrongDevPort.status).toBe(403);
    expect(nullOrigin.status).toBe(403);
    expect(missingHost.status).toBe(403);
  });

  it("开发模式只允许 3211 预检和请求，并回正确 CORS 头", async () => {
    const app = createApp(true);
    const preflight = await appRequest(app, "/api/works", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:3211",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    const response = await appRequest(app, "/api/version", {
      headers: { Origin: "http://localhost:3211" },
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:3211",
    );
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, PATCH, PUT, DELETE",
    );
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type",
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3211",
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("开发模式下最终错误响应都带上跨域头", async () => {
    const usecases = createFakeUseCases();
    usecases.showWork = (id) => {
      if (id === "conflict") {
        throw new LeafPressError("STATE_CONFLICT", "状态已变化");
      }
      throw new Error("内部故障");
    };
    const app = createApp(true, usecases);
    const origin = "http://127.0.0.1:3211";
    const responses = [
      await appRequest(app, "/api/ideas", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ text: "灵感", source: "quick", extra: true }),
      }),
      await appRequest(app, "/api/no-such-route", {
        headers: { Origin: origin },
      }),
      await appRequest(app, "/api/works/conflict", {
        headers: { Origin: origin },
      }),
      await appRequest(app, "/api/ideas", {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ text: "灵感", source: "quick" }),
      }),
      await appRequest(app, "/api/works/internal", {
        headers: { Origin: origin },
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      400, 404, 409, 415, 500,
    ]);
    for (const response of responses) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Vary")).toBe("Origin");
    }
  });

  it("非开发模式不会回 CORS 头", async () => {
    const app = createApp();
    const response = await appRequest(app, "/api/version", {
      headers: { Origin: "http://127.0.0.1:3210" },
    });

    const devOrigin = await appRequest(app, "/api/version", {
      headers: { Origin: "http://localhost:3211" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
    expect(devOrigin.status).toBe(403);
    expect(devOrigin.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
