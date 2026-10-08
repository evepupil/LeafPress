import { describe, expect, it } from "vitest";

import { createServerApp } from "../../src/server/app.js";
import { createFakeUseCases, versionFixture } from "./fake-usecases.js";
import { appRequest, jsonBody, jsonHeaders } from "./request.js";

describe("数据与周报路由", () => {
  it("拉取数据并返回结果和新版本", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const input = { accountIds: ["zhihu-1"] };
    const response = await appRequest(app, "/api/data/pull", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: versionFixture,
      outcomes: [],
      note: "全部入库",
    });
    expect(usecases.pullData).toHaveBeenCalledWith(input);
  });

  it("保存周报笔记", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const input = { wins: "完成", improve: "聚焦", next: "继续" };
    const response = await appRequest(app, "/api/notes/2026-01-05", {
      method: "PUT",
      headers: jsonHeaders(),
      body: jsonBody(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: versionFixture,
    });
    expect(usecases.saveNote).toHaveBeenCalledWith("2026-01-05", input);
  });
});
