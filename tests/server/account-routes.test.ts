import { describe, expect, it } from "vitest";

import { createServerApp } from "../../src/server/app.js";
import {
  accountFixture,
  createFakeUseCases,
  versionFixture,
} from "./fake-usecases.js";
import { appRequest, jsonBody, jsonHeaders } from "./request.js";

describe("账号路由", () => {
  it("添加账号", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const input = {
      platform: "zhihu",
      name: "知乎账号",
      intro: "简介",
      settings: { region: "CN" },
    };
    const response = await appRequest(app, "/api/accounts", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: versionFixture,
      account: accountFixture,
    });
    expect(usecases.addAccount).toHaveBeenCalledWith(input);
  });

  it("更新账号、保存档案和设置项", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const update = await appRequest(app, "/api/accounts/zhihu-1", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: jsonBody({ stage: "paused", handle: null }),
    });
    const profile = await appRequest(app, "/api/accounts/zhihu-1/profile", {
      method: "PUT",
      headers: jsonHeaders(),
      body: jsonBody({ profile: "档案内容" }),
    });
    const setting = await appRequest(
      app,
      "/api/accounts/zhihu-1/settings/region",
      {
        method: "PUT",
        headers: jsonHeaders(),
        body: jsonBody({ value: "US" }),
      },
    );

    expect(await update.json()).toEqual({ ok: true, version: versionFixture });
    expect(await profile.json()).toEqual({ ok: true, version: versionFixture });
    expect(await setting.json()).toEqual({ ok: true, version: versionFixture });
    expect(usecases.updateAccount).toHaveBeenCalledWith("zhihu-1", {
      stage: "paused",
      handle: null,
    });
    expect(usecases.saveProfile).toHaveBeenCalledWith("zhihu-1", "档案内容");
    expect(usecases.setSetting).toHaveBeenCalledWith("zhihu-1", "region", "US");
  });
});
