import { describe, expect, it } from "vitest";

import { createServerApp } from "../../src/server/app.js";
import {
  createFakeUseCases,
  ideaFixture,
  versionFixture,
} from "./fake-usecases.js";
import { appRequest, jsonBody, jsonHeaders } from "./request.js";

describe("灵感路由", () => {
  it("添加灵感时用单元素数组调用用例", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const input = { text: "一个新想法", source: "quick" };
    const response = await appRequest(app, "/api/ideas", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: versionFixture,
      idea: ideaFixture,
    });
    expect(usecases.addIdeas).toHaveBeenCalledWith([input]);
  });

  it("更新、移动和删除灵感", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const update = await appRequest(app, "/api/ideas/idea-1", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: jsonBody({ detail: "补充说明", accountId: null }),
    });
    const move = await appRequest(app, "/api/ideas/idea-1/move", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody({ status: "promising", beforeId: null }),
    });
    const remove = await appRequest(app, "/api/ideas/idea-1", {
      method: "DELETE",
    });

    expect(await update.json()).toEqual({ ok: true, version: versionFixture });
    expect(await move.json()).toEqual({ ok: true, version: versionFixture });
    expect(await remove.json()).toEqual({ ok: true, version: versionFixture });
    expect(usecases.updateIdea).toHaveBeenCalledWith("idea-1", {
      detail: "补充说明",
      accountId: null,
    });
    expect(usecases.moveIdea).toHaveBeenCalledWith("idea-1", {
      status: "promising",
      beforeId: null,
    });
    expect(usecases.deleteIdea).toHaveBeenCalledWith("idea-1");
  });
});
