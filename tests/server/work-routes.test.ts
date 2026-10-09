import { describe, expect, it, vi } from "vitest";

import { LeafPressError } from "../../src/shared/errors.js";
import { createServerApp } from "../../src/server/app.js";
import {
  createFakeUseCases,
  bootstrapFixture,
  datasetFixture,
  versionFixture,
  workDetailFixture,
  workFixture,
} from "./fake-usecases.js";
import { appRequest, jsonBody, jsonHeaders } from "./request.js";

const expectedVersion = { ok: true, version: versionFixture };

describe("作品与系统路由", () => {
  it("只读路由直接返回对应数据", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    const version = await appRequest(app, "/api/version");
    const bootstrap = await appRequest(app, "/api/bootstrap");
    const dataset = await appRequest(app, "/api/dataset");
    const work = await appRequest(app, "/api/works/work-1");

    expect(await version.json()).toEqual(versionFixture);
    expect(await bootstrap.json()).toEqual(bootstrapFixture);
    expect(await dataset.json()).toEqual(datasetFixture);
    expect(await work.json()).toEqual(workDetailFixture);
    expect(usecases.version).toHaveBeenCalledTimes(1);
    expect(usecases.bootstrap).toHaveBeenCalledTimes(1);
    expect(usecases.dataset).toHaveBeenCalledTimes(1);
    expect(usecases.showWork).toHaveBeenCalledWith("work-1");
  });

  it("创建作品并回传作品和变更序号", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const input = {
      source: { kind: "idea", ideaId: "idea-1" },
      accountIds: ["zhihu-1"],
      brief: "先写短稿",
    };

    const response = await appRequest(app, "/api/works", {
      method: "POST",
      headers: jsonHeaders(),
      body: jsonBody(input),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...expectedVersion,
      works: [workFixture],
    });
    expect(usecases.createWorks).toHaveBeenCalledWith(input);
  });

  it("作品更新、移动、反馈、删除和打开目录都转发正确参数", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const cases = [
      ["PATCH", "/api/works/work-1", { title: "新标题" }],
      ["POST", "/api/works/work-1/move", { status: "waiting", beforeId: null }],
      ["POST", "/api/works/work-1/feedback", { text: "补上来源" }],
    ] as const;

    for (const [method, path, body] of cases) {
      const response = await appRequest(app, path, {
        method,
        headers: jsonHeaders(),
        body: jsonBody(body),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expectedVersion);
    }
    const deleted = await appRequest(app, "/api/works/work-1", {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual(expectedVersion);
    const opened = await appRequest(app, "/api/works/work-1/open-folder", {
      method: "POST",
    });
    expect(opened.status).toBe(200);
    expect(await opened.json()).toEqual({
      ok: true,
      path: workDetailFixture.folder,
    });

    expect(usecases.updateWork).toHaveBeenCalledWith("work-1", {
      title: "新标题",
    });
    expect(usecases.moveWork).toHaveBeenCalledWith("work-1", {
      status: "waiting",
      beforeId: null,
    });
    expect(usecases.submitFeedback).toHaveBeenCalledWith("work-1", "补上来源");
    expect(usecases.deleteWork).toHaveBeenCalledWith("work-1");
    expect(usecases.openWorkFolder).toHaveBeenCalledWith("work-1");
  });

  it("导出备份回传目录和新的版本", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });
    const response = await appRequest(app, "/api/export", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...expectedVersion,
      dir: "/tmp/home/backups/export",
    });
    expect(usecases.exportBackup).toHaveBeenCalledOnce();
  });

  it("读任务文件：返回文件本身和类型，名字解码后传给用例", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    const response = await appRequest(
      app,
      "/api/works/work-1/files/%E7%9F%A5%E4%B9%8E%E5%8F%91%E5%B8%83%E7%A8%BF.html",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array(Buffer.from("<p>复制页</p>", "utf8")),
    );
    expect(usecases.readWorkFile).toHaveBeenCalledWith(
      "work-1",
      "知乎发布稿.html",
    );
  });

  it("名字带空格的文件也能读，用例里的错误转成 404", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    const spaced = await appRequest(
      app,
      "/api/works/work-1/files/my%20file.html",
    );
    expect(spaced.status).toBe(200);
    expect(usecases.readWorkFile).toHaveBeenCalledWith(
      "work-1",
      "my file.html",
    );

    vi.mocked(usecases.readWorkFile).mockImplementation(() => {
      throw new LeafPressError("NOT_FOUND", "任务文件夹里没有这个文件");
    });
    const missing = await appRequest(
      app,
      "/api/works/work-1/files/%E6%B2%A1%E6%9C%89.html",
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "任务文件夹里没有这个文件",
      },
    });
  });

  it("编号不合法或文件名解不出时直接 404，不调用用例", async () => {
    const usecases = createFakeUseCases();
    const app = createServerApp({ usecases, port: 3210 });

    const badId = await appRequest(app, "/api/works/WORK_1/files/a.html");
    expect(badId.status).toBe(404);
    const badName = await appRequest(
      app,
      "/api/works/work-1/files/%2e%2e%2fconfig.json",
    );
    expect(badName.status).toBe(404);
    expect(usecases.readWorkFile).not.toHaveBeenCalled();
  });
});
