import { describe, expect, it } from "vitest";

import { LeafPressError } from "../../src/shared/errors.js";
import { createServerApp } from "../../src/server/app.js";
import { createFakeUseCases } from "./fake-usecases.js";
import { appRequest, jsonBody, jsonHeaders } from "./request.js";

function appWithShowWorkError(
  error: unknown,
  logError: (message: string) => void = () => undefined,
) {
  const usecases = createFakeUseCases();
  usecases.showWork = () => {
    throw error;
  };
  return createServerApp({ usecases, port: 3210, logError });
}

describe("HTTP 错误映射", () => {
  it.each([
    [
      new LeafPressError("USAGE", "参数不正确", { hint: "请检查输入" }),
      400,
      "USAGE",
    ],
    [new LeafPressError("NOT_FOUND", "找不到作品"), 404, "NOT_FOUND"],
    [new LeafPressError("STATE_CONFLICT", "状态已变化"), 409, "STATE_CONFLICT"],
    [
      new LeafPressError("STEP_OUTPUT_INVALID", "缺少产出"),
      409,
      "STEP_OUTPUT_INVALID",
    ],
  ])("把领域错误转换为指定状态", async (error, status, code) => {
    const app = appWithShowWorkError(error);
    const response = await appRequest(app, "/api/works/work-1");
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code, message: error.message },
    });
  });

  it("其他 LeafPressError 和非 LeafPressError 都是 500 并记录错误，不含调用栈", async () => {
    const messages: string[] = [];
    const domainApp = appWithShowWorkError(
      new LeafPressError("STORE_FAILED", "记录库不可用"),
      (message) => messages.push(message),
    );
    const domainResponse = await appRequest(domainApp, "/api/works/work-1");
    expect(domainResponse.status).toBe(500);
    expect(messages).toEqual(["记录库不可用"]);
    expect(await domainResponse.json()).toEqual({
      ok: false,
      error: { code: "STORE_FAILED", message: "记录库不可用" },
    });

    const unknownApp = appWithShowWorkError(new Error("底层失败"), (message) =>
      messages.push(message),
    );
    const unknownResponse = await appRequest(unknownApp, "/api/works/work-1");
    expect(unknownResponse.status).toBe(500);
    expect(messages).toEqual(["记录库不可用", "内部错误：底层失败"]);
    const unknownBody = await unknownResponse.json();
    expect(unknownBody).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "内部错误：底层失败" },
    });
    expect(JSON.stringify(unknownBody)).not.toContain("stack");
  });
});

describe("请求校验", () => {
  it("多余字段、必填字段缺失和字段类型错误都返回 400，不回显字段值", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const extra = await appRequest(app, "/api/accounts", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody({
        platform: "zhihu",
        name: "知乎账号",
        intro: "简介",
        accountid: "不应回显的秘密值",
      }),
    });
    const nestedExtra = await appRequest(app, "/api/works", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody({
        source: {
          kind: "new",
          title: "新作品",
          extra: "不应回显的嵌套秘密值",
        },
        accountIds: [],
        brief: "",
      }),
    });
    const missing = await appRequest(app, "/api/ideas", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody({ text: "灵感", detail: "缺来源" }),
    });
    const wrongType = await appRequest(app, "/api/works", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody({
        source: { kind: "new", title: 923 },
        accountIds: [],
        brief: "",
      }),
    });

    for (const response of [extra, nestedExtra, missing, wrongType])
      expect(response.status).toBe(400);
    const errorText = `${JSON.stringify(await extra.json())}${JSON.stringify(await nestedExtra.json())}${JSON.stringify(await missing.json())}${JSON.stringify(await wrongType.json())}`;
    expect(errorText).not.toContain("不应回显的秘密值");
    expect(errorText).not.toContain("不应回显的嵌套秘密值");
    expect(errorText).not.toContain("923");
    expect(errorText).toContain("请求体：不认识的字段 accountid");
    expect(errorText).toContain("source：不认识的字段 extra");
    expect(errorText).toContain("source");
    expect(usecases.addIdeas).not.toHaveBeenCalled();
    expect(usecases.createWorks).not.toHaveBeenCalled();
  });

  it("GBK 编码的 JSON 请求体按非法 UTF-8 拒绝", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const prefix = new TextEncoder().encode('{"text":"');
    const gbkText = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
    const suffix = new TextEncoder().encode('","source":"quick"}');
    const bytes = new Uint8Array(
      prefix.length + gbkText.length + suffix.length,
    );
    bytes.set(prefix);
    bytes.set(gbkText, prefix.length);
    bytes.set(suffix, prefix.length + gbkText.length);

    const response = await app.request(
      new Request("http://127.0.0.1:3210/api/ideas", {
        method: "POST",
        headers: {
          Host: "127.0.0.1:3210",
          "Content-Type": "application/json",
        },
        body: bytes.buffer,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "USAGE", message: "请求体不是 UTF-8 编码" },
    });
    expect(usecases.addIdeas).not.toHaveBeenCalled();
  });

  it("拒绝非 JSON 请求体和非法编号", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const unsupported = await appRequest(app, "/api/works/work-1", {
      method: "PATCH",
      body: jsonBody({ title: "新标题" }),
    });
    const invalidId = await appRequest(app, "/api/works/INVALID!", {
      method: "PATCH",
      headers: jsonHeaders(),
      body: jsonBody({ title: "新标题" }),
    });
    const invalidJson = await appRequest(app, "/api/ideas", {
      method: "POST",
      headers: jsonHeaders(),
      body: "{",
    });

    expect(unsupported.status).toBe(415);
    expect(invalidId.status).toBe(404);
    expect(invalidJson.status).toBe(400);
    expect(usecases.updateWork).not.toHaveBeenCalled();
  });
});
