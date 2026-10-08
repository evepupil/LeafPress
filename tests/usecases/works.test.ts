import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LeafPressError } from "../../src/shared/errors.js";
import type { UseCases } from "@leafpress/core";
import type { CodeStepHandler } from "../../src/platforms/types.js";
import { homePaths } from "../../src/config/home.js";
import { taskFolderPath } from "../../src/files/task-folder.js";
import { withUseCases, addAccount, createWork } from "./helpers.js";

function expectCode(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(LeafPressError);
  expect(caught).toMatchObject({ code });
}

async function startAtArchive(
  usecases: UseCases,
  home: string,
  accountId: string,
  title: string,
) {
  const work = createWork(usecases, accountId, title);
  const first = usecases.startWork({ id: work.id });
  if (!first.lease) throw new Error("写稿步骤没有发放令牌");
  await writeFile(join(first.detail.folder, "稿子.md"), "文章正文", "utf8");
  const waiting = usecases.stepWork(work.id, first.lease.token);
  expect(waiting.detail.work.status).toBe("waiting");
  usecases.submitFeedback(work.id, "发布了 https://zhuanlan.zhihu.com/p/1");
  const resumed = usecases.startWork({ id: work.id });
  if (!resumed.lease) throw new Error("归档步骤没有发放令牌");
  return { work, resumed, folder: taskFolderPath(homePaths(home), work.id) };
}

describe("业务用例：作品和 agent", () => {
  it("1. 一条灵感转三个账号，写入有序作品和任务镜像", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const accounts = ["博客甲", "博客乙", "博客丙"].map((name) =>
        addAccount(usecases, name),
      );
      const [idea] = usecases.addIdeas([
        { text: "  记录一次发布流程  ", detail: "保留步骤", source: "quick" },
      ]);
      if (!idea) throw new Error("没有创建灵感");
      expectCode(
        () =>
          usecases.createWorks({
            source: { kind: "new", title: "" },
            accountIds: [accounts[0]!.id],
            brief: "",
          }),
        "USAGE",
      );
      expectCode(
        () =>
          usecases.createWorks({
            source: { kind: "new", title: "重复账号" },
            accountIds: [accounts[0]!.id, accounts[0]!.id],
            brief: "",
          }),
        "USAGE",
      );
      expectCode(
        () =>
          usecases.createWorks({
            source: { kind: "new", title: "空账号" },
            accountIds: [],
            brief: "",
          }),
        "USAGE",
      );
      const works = usecases.createWorks({
        source: { kind: "idea", ideaId: idea.id },
        accountIds: accounts.map((account) => account.id),
        brief: "多平台版本",
      });
      expect(works.map((work) => work.id)).toEqual(["b-1", "b-2", "b-3"]);
      expect(works.map((work) => work.order)).toEqual([1, 2, 3]);
      expect(works.map((work) => work.workflowId)).toEqual([
        "general-write",
        "general-write",
        "general-write",
      ]);
      expect(usecases.listIdeas({ status: ["converted"] })[0]).toMatchObject({
        id: idea.id,
        status: "converted",
        workIds: works.map((work) => work.id),
      });
      for (const work of works) {
        const files = await readdir(taskFolderPath(app.paths, work.id));
        expect(files.sort()).toEqual(["作品.md", "状态.json", "记录.log"]);
      }
    });
  });

  it("2. 完整写稿、作者反馈、真实归档实现并完成发布", async () => {
    const startedAt = performance.now();
    await withUseCases(async ({ usecases }) => {
      const account = addAccount(usecases);
      const work = createWork(usecases, account.id, "端到端文章");
      const started = usecases.startNext();
      expect(started?.detail.work.id).toBe(work.id);
      const token = started?.lease?.token;
      if (!started || !token) throw new Error("startNext 没有返回租约");
      expect(() => usecases.stepWork(work.id, token)).toThrowError(
        LeafPressError,
      );
      try {
        usecases.stepWork(work.id, token);
      } catch (error) {
        expect(error).toMatchObject({ code: "STEP_OUTPUT_INVALID" });
      }
      await writeFile(
        join(started.detail.folder, "稿子.md"),
        "# 已完成的稿子\n正文",
        "utf8",
      );
      const waiting = usecases.stepWork(work.id, token);
      expect(waiting.detail.work.status).toBe("waiting");
      expect(
        await readFile(join(started.detail.folder, "要你做的事.md"), "utf8"),
      ).toContain("发到博客");
      usecases.submitFeedback(work.id, "发布了 https://zhuanlan.zhihu.com/p/1");
      expect(usecases.listWorks({ status: ["todo"] })[0]?.id).toBe(work.id);
      expect(
        await readFile(join(started.detail.folder, "你的反馈.md"), "utf8"),
      ).toContain("发布了 https://zhuanlan.zhihu.com/p/1");
      const resumed = usecases.startWork({ id: work.id });
      expect(resumed.message).toBe("读了你的反馈，接着做：归档链接");
      const result = await usecases.runWork(
        work.id,
        resumed.lease?.token ?? "",
      );
      expect(result.detail.work).toMatchObject({
        status: "done",
        url: "https://zhuanlan.zhihu.com/p/1",
        publishedAt: "2026-10-08",
      });
      expect(
        JSON.parse(
          await readFile(join(started.detail.folder, "状态.json"), "utf8"),
        ),
      ).toMatchObject({ status: "done" });
      await expect(
        readFile(join(started.detail.folder, "要你做的事.md"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeGreaterThan(0);
  });

  it("3. 令牌拒绝、强制接管、租约过期接管和网页挪回", async () => {
    await withUseCases(({ usecases, clock }) => {
      const account = addAccount(usecases);
      const work = createWork(usecases, account.id);
      const first = usecases.startWork({ id: work.id });
      const firstToken = first.lease?.token;
      if (!firstToken) throw new Error("没有首个令牌");
      expect(() => usecases.startWork({ id: work.id })).toThrow(
        /正在被别的 agent 做（10月8日 09:00 接手/,
      );
      expectCode(() => usecases.startWork({ id: work.id }), "STATE_CONFLICT");
      const forced = usecases.startWork({ id: work.id, force: true });
      expect(forced.lease?.token).not.toBe(firstToken);
      expectCode(
        () => usecases.stepWork(work.id, firstToken),
        "STATE_CONFLICT",
      );
      clock.set(new Date("2026-10-08T12:01:00+08:00"));
      const expiredTakeover = usecases.startWork({ id: work.id });
      expect(expiredTakeover.lease?.token).not.toBe(forced.lease?.token);
      usecases.moveWork(work.id, { status: "todo", beforeId: null });
      expectCode(
        () => usecases.stepWork(work.id, expiredTakeover.lease?.token ?? ""),
        "STATE_CONFLICT",
      );
    });
  });

  it("作品维护、交还和退回的验证错误码及打开文件夹", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const account = addAccount(usecases);
      const edited = createWork(usecases, account.id, "待编辑作品");
      expect(
        usecases.updateWork(edited.id, { title: "已编辑标题" }).title,
      ).toBe("已编辑标题");
      expectCode(() => usecases.updateWork(edited.id, { title: " " }), "USAGE");
      let executed: { command: string; args: readonly string[] } | undefined;
      app.exec = (command, args) => {
        executed = { command, args };
        return Promise.resolve({
          stdout: "",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        });
      };
      const folder = await usecases.openWorkFolder(edited.id);
      expect(executed?.args).toEqual([folder]);
      expect(executed?.command).toMatch(/explorer\.exe|xdg-open|open/);
      usecases.deleteWork(edited.id);
      expectCode(() => usecases.showWork(edited.id), "NOT_FOUND");

      const releasable = createWork(usecases, account.id, "交还作品");
      const releaseStart = usecases.startWork({ id: releasable.id });
      const releaseToken = releaseStart.lease?.token ?? "";
      expectCode(
        () => usecases.releaseWork(releasable.id, "wrong-token"),
        "STATE_CONFLICT",
      );
      expect(usecases.releaseWork(releasable.id, releaseToken).status).toBe(
        "todo",
      );

      const backable = await startAtArchive(
        usecases,
        app.paths.home,
        account.id,
        "退回作品",
      );
      const backToken = backable.resumed.lease?.token ?? "";
      expectCode(
        () => usecases.backWork(backable.work.id, "wrong-token", 1),
        "STATE_CONFLICT",
      );
      expect(
        usecases.backWork(backable.work.id, backToken, 1).detail.work.step,
      ).toBe(0);
    });
  });

  it("反馈和交还后都排在待实现最前面", async () => {
    await withUseCases(async ({ usecases, app }) => {
      const account = addAccount(usecases);
      const first = createWork(usecases, account.id, "原第一篇");
      const second = createWork(usecases, account.id, "原第二篇");
      const third = createWork(usecases, account.id, "原第三篇");
      const feedbackWork = createWork(usecases, account.id, "提交反馈");
      const started = usecases.startWork({ id: feedbackWork.id });
      const token = started.lease?.token ?? "";
      await writeFile(join(started.detail.folder, "稿子.md"), "正文", "utf8");
      usecases.stepWork(feedbackWork.id, token);
      usecases.submitFeedback(
        feedbackWork.id,
        "发布了 https://example.test/post",
      );
      expect(
        usecases.listWorks({ status: ["todo"] }).map((work) => work.id),
      ).toEqual([feedbackWork.id, first.id, second.id, third.id]);

      const releaseStart = usecases.startWork({ id: second.id });
      const released = usecases.releaseWork(
        second.id,
        releaseStart.lease?.token ?? "",
      );
      expect(released.status).toBe("todo");
      expect(
        usecases.listWorks({ status: ["todo"] }).map((work) => work.id),
      ).toEqual([second.id, feedbackWork.id, first.id, third.id]);
      expect(app.store.works.get(second.id)?.order).toBeLessThan(
        app.store.works.get(feedbackWork.id)?.order ?? 0,
      );
    });
  });

  it("5. runWork 保存 fail、ask，拒绝挪走后的结果并续租 heartbeat", async () => {
    let mode: "fail" | "ask" | "move" | "heartbeat" | "block" = "fail";
    let moveUseCases: UseCases | undefined;
    let heartbeatClock: ((value: Date) => void) | undefined;
    let readLeaseExpiry: ((id: string) => string | undefined) | undefined;
    let beforeHeartbeatExpiry: string | undefined;
    let afterHeartbeatExpiry: string | undefined;
    let signalBlockedStart: (() => void) | undefined;
    let waitForBlockedResult:
      Promise<{ kind: "done"; url: string }> | undefined;
    const handler: CodeStepHandler = (ctx) => {
      if (mode === "fail")
        return Promise.resolve({ kind: "fail", error: "归档服务不可用" });
      if (mode === "ask")
        return Promise.resolve({ kind: "ask", ask: "请补充发布链接" });
      if (mode === "move") {
        moveUseCases?.moveWork(ctx.work.id, {
          status: "waiting",
          beforeId: null,
        });
        return Promise.resolve({
          kind: "done",
          url: "https://example.test/post",
        });
      }
      if (mode === "block") {
        signalBlockedStart?.();
        return waitForBlockedResult ?? Promise.resolve({ kind: "done" });
      }
      const before = ctx.work.lease?.expiresAt;
      beforeHeartbeatExpiry = readLeaseExpiry?.(ctx.work.id);
      heartbeatClock?.(new Date("2026-10-08T10:00:00+08:00"));
      ctx.heartbeat();
      afterHeartbeatExpiry = readLeaseExpiry?.(ctx.work.id);
      return Promise.resolve({
        kind: "fail",
        error: `heartbeat:${before ?? "missing"}`,
      });
    };
    await withUseCases(
      async ({ usecases, app, clock }) => {
        moveUseCases = usecases;
        heartbeatClock = (value) => clock.set(value);
        readLeaseExpiry = (id) => app.store.works.get(id)?.lease?.expiresAt;
        const account = addAccount(usecases);
        const failCase = await startAtArchive(
          usecases,
          app.paths.home,
          account.id,
          "失败案例",
        );
        const failed = await usecases.runWork(
          failCase.work.id,
          failCase.resumed.lease?.token ?? "",
        );
        expect(failed.detail.work).toMatchObject({
          status: "doing",
          error: "归档服务不可用",
        });
        expect(failed.message).toContain("出错了：归档服务不可用");
        expect(
          await readFile(
            join(failCase.resumed.detail.folder, "作品.md"),
            "utf8",
          ),
        ).toContain("出错了");

        mode = "ask";
        const askCase = await startAtArchive(
          usecases,
          app.paths.home,
          account.id,
          "等待案例",
        );
        const asked = await usecases.runWork(
          askCase.work.id,
          askCase.resumed.lease?.token ?? "",
        );
        expect(asked.detail.work).toMatchObject({
          status: "waiting",
          step: 2,
          ask: "请补充发布链接",
        });

        mode = "move";
        const moveCase = await startAtArchive(
          usecases,
          app.paths.home,
          account.id,
          "挪动案例",
        );
        await expect(
          usecases.runWork(
            moveCase.work.id,
            moveCase.resumed.lease?.token ?? "",
          ),
        ).rejects.toMatchObject({
          code: "STATE_CONFLICT",
          message: "执行期间作品被挪走了，这次的结果没有记下",
        });
        expect(usecases.showWork(moveCase.work.id).work.status).toBe("waiting");
        expect(usecases.showWork(moveCase.work.id).work.url).toBeUndefined();

        mode = "heartbeat";
        const heartbeatCase = await startAtArchive(
          usecases,
          app.paths.home,
          account.id,
          "续租案例",
        );
        clock.set(new Date("2026-10-08T09:30:00+08:00"));
        await usecases.runWork(
          heartbeatCase.work.id,
          heartbeatCase.resumed.lease?.token ?? "",
        );
        expect(afterHeartbeatExpiry).toBe("2026-10-08T12:00:00+08:00");
        expect(Date.parse(afterHeartbeatExpiry ?? "")).toBeGreaterThan(
          Date.parse(beforeHeartbeatExpiry ?? ""),
        );
        expect(
          usecases.showWork(heartbeatCase.work.id).work.lease?.expiresAt,
        ).toBe("2026-10-08T12:00:00+08:00");

        mode = "block";
        const blockedCase = await startAtArchive(
          usecases,
          app.paths.home,
          account.id,
          "运行中接管案例",
        );
        let signalStart: (() => void) | undefined;
        let resolveResult:
          ((outcome: { kind: "done"; url: string }) => void) | undefined;
        const startedRunning = new Promise<void>((resolve) => {
          signalStart = resolve;
        });
        waitForBlockedResult = new Promise((resolve) => {
          resolveResult = resolve;
        });
        signalBlockedStart = signalStart;
        const running = usecases.runWork(
          blockedCase.work.id,
          blockedCase.resumed.lease?.token ?? "",
        );
        await startedRunning;
        const forced = usecases.startWork({
          id: blockedCase.work.id,
          force: true,
        });
        expect(forced.lease?.token).not.toBe(blockedCase.resumed.lease?.token);
        resolveResult?.({ kind: "done", url: "https://example.test/stale" });
        await expect(running).rejects.toMatchObject({ code: "STATE_CONFLICT" });
        expect(usecases.showWork(blockedCase.work.id).work).toMatchObject({
          status: "doing",
          step: 2,
        });
        expect(usecases.showWork(blockedCase.work.id).work.url).toBeUndefined();
        expect(
          JSON.parse(
            await readFile(join(blockedCase.folder, "状态.json"), "utf8"),
          ),
        ).toMatchObject({ status: "doing" });
      },
      { codeStep: handler },
    );
  });

  it("6. 拖动待实现顺序、进行中清令牌、完成作品不可挪出", async () => {
    await withUseCases(({ usecases }) => {
      const account = addAccount(usecases);
      const first = createWork(usecases, account.id, "第一篇");
      const second = createWork(usecases, account.id, "第二篇");
      const third = createWork(usecases, account.id, "第三篇");
      usecases.moveWork(third.id, { status: "todo", beforeId: first.id });
      expect(
        usecases.listWorks({ status: ["todo"] }).map((work) => work.id),
      ).toEqual([third.id, first.id, second.id]);
      const started = usecases.startWork({ id: first.id });
      usecases.moveWork(first.id, { status: "waiting", beforeId: null });
      expectCode(
        () => usecases.stepWork(first.id, started.lease?.token ?? ""),
        "STATE_CONFLICT",
      );
      usecases.moveWork(second.id, { status: "done", beforeId: null });
      expectCode(
        () => usecases.moveWork(second.id, { status: "todo", beforeId: null }),
        "STATE_CONFLICT",
      );
    });
  });
});
