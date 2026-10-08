import { describe, expect, it } from "vitest";

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
});
