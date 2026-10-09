import type { ImportSummary } from "@leafpress/core";
import { describe, expect, it } from "vitest";

import { createServerApp } from "../../src/server/app.js";
import { LeafPressError } from "../../src/shared/errors.js";
import {
  createFakeUseCases,
  versionFixture,
  workFixture,
} from "./fake-usecases.js";
import { appRequest } from "./request.js";

const IMPORT_PATH = "/api/accounts/blog-1/import";

const summary: ImportSummary = {
  added: 1,
  skipped: 2,
  drafts: 3,
  issues: [{ path: "/repo/content/posts/zh/broken.mdx", message: "缺少标题" }],
  works: [{ ...workFixture, id: "b-1", status: "done" }],
};

describe("导入文章路由", () => {
  it("POST 调导入用例，返回导入完成之后的变更序号和摘要，不要求请求体", async () => {
    const usecases = createFakeUseCases();
    let seq = versionFixture.seq;
    usecases.importPosts = () => {
      seq += 1;
      return Promise.resolve(summary);
    };
    usecases.version = () => ({ ...versionFixture, seq });
    const app = createServerApp({ usecases, port: 3210 });

    const response = await appRequest(app, IMPORT_PATH, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: { ...versionFixture, seq: 8 },
      summary,
    });
  });

  it("账号编号原样交给用例", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    await appRequest(app, IMPORT_PATH, { method: "POST" });

    expect(usecases.importPosts).toHaveBeenCalledTimes(1);
    expect(usecases.importPosts).toHaveBeenCalledWith("blog-1");
  });

  it.each([
    [new LeafPressError("USAGE", "知乎还不能导入"), 400, undefined],
    [new LeafPressError("NOT_FOUND", "没有这个账号：blog-9"), 404, undefined],
    [
      new LeafPressError("STATE_CONFLICT", "博客仓库位置还没配", {
        hint: "在账号详情 · 接入里填",
      }),
      409,
      "在账号详情 · 接入里填",
    ],
  ])("导入用例报错 %s 时转成对应的 HTTP 状态", async (error, status, hint) => {
    const usecases = createFakeUseCases();
    usecases.importPosts = () => Promise.reject(error);
    const app = createServerApp({ usecases, port: 3210 });

    const response = await appRequest(app, IMPORT_PATH, { method: "POST" });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(hint === undefined ? {} : { hint }),
      },
    });
  });

  it("导入工具没登记是 500：记一条日志，不泄露调用栈", async () => {
    const usecases = createFakeUseCases();
    usecases.importPosts = () =>
      Promise.reject(new LeafPressError("INTERNAL", "博客的导入工具没有登记"));
    const messages: string[] = [];
    const app = createServerApp({
      usecases,
      port: 3210,
      logError: (message) => messages.push(message),
    });

    const response = await appRequest(app, IMPORT_PATH, { method: "POST" });

    expect(response.status).toBe(500);
    expect(messages).toEqual(["博客的导入工具没有登记"]);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "博客的导入工具没有登记" },
    });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("账号编号不合法时直接 404，不调用例；GET 不开放导入", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    const invalid = await appRequest(app, "/api/accounts/Bad!Id/import", {
      method: "POST",
    });
    const wrongMethod = await appRequest(app, IMPORT_PATH);

    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "找不到该编号。" },
    });
    expect(wrongMethod.status).toBe(404);
    expect(usecases.importPosts).not.toHaveBeenCalled();
  });
});
