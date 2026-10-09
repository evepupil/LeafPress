import { describe, expect, it } from "vitest";

import type {
  DataPullContext,
  DataPullOutcome,
  DataTool,
} from "../../src/platforms/types.js";
import { addAccount, catalogWith, withUseCases } from "./helpers.js";

/** 博客账号要配两样才拉得了数据：站点地址、统计密钥 */
function catalogForPull() {
  return catalogWith({
    blog: {
      setupItems: [
        {
          key: "site-url",
          label: "站点地址",
          secret: false,
          usedFor: "data" as const,
        },
        {
          key: "analytics-token",
          label: "统计密钥",
          secret: true,
          usedFor: "data" as const,
        },
      ],
      dataTool: { mode: "api", provider: "测试统计" },
    },
  });
}

const SETTINGS = {
  "site-url": "https://site.example",
  "analytics-token": "analytics-secret",
};

const SUCCESS: DataPullOutcome = {
  ok: true,
  result: { account: [], works: [], note: "入库 0 篇文章" },
};

/** 假的数据工具：拉的过程中按给定的话报进度，再成功收工 */
function toolReporting(messages: (ctx: DataPullContext) => string[]): DataTool {
  return {
    pull(ctx) {
      for (const message of messages(ctx)) ctx.progress?.(message);
      return Promise.resolve(SUCCESS);
    },
  };
}

describe("拉数据的进度", () => {
  it("数据工具报的进度原样交给调用方，带上是哪个账号", async () => {
    const dataTool = toolReporting(() => [
      "补历史：第 10/182 天",
      "补历史：第 20/182 天",
    ]);
    await withUseCases(
      async ({ usecases }) => {
        const first = addAccount(usecases, "主博客", "blog", SETTINGS);
        const second = addAccount(usecases, "副博客", "blog", SETTINGS);
        const received: [string, string][] = [];

        const result = await usecases.pullData({
          onProgress: (accountId, message) => {
            received.push([accountId, message]);
          },
        });

        expect(result.outcomes).toEqual([
          { accountId: first.id, status: "ok" },
          { accountId: second.id, status: "ok" },
        ]);
        expect(received).toEqual([
          [first.id, "补历史：第 10/182 天"],
          [first.id, "补历史：第 20/182 天"],
          [second.id, "补历史：第 10/182 天"],
          [second.id, "补历史：第 20/182 天"],
        ]);
      },
      { catalog: catalogForPull(), dataTool },
    );
  });

  it("只拉指定的账号时，只收到这个账号的进度；被拦下没拉的账号没有进度", async () => {
    const dataTool = toolReporting((ctx) => [`正在拉 ${ctx.account.name}`]);
    await withUseCases(
      async ({ usecases }) => {
        addAccount(usecases, "不拉的博客", "blog", SETTINGS);
        const wanted = addAccount(usecases, "要拉的博客", "blog", SETTINGS);
        const unconfigured = addAccount(usecases, "没配的博客");
        const received: [string, string][] = [];

        const result = await usecases.pullData({
          accountIds: [wanted.id, unconfigured.id],
          onProgress: (accountId, message) => {
            received.push([accountId, message]);
          },
        });

        expect(result.outcomes.map((outcome) => outcome.status)).toEqual([
          "ok",
          "failed",
        ]);
        expect(received).toEqual([[wanted.id, "正在拉 要拉的博客"]]);
      },
      { catalog: catalogForPull(), dataTool },
    );
  });

  it("调用方没要进度时，数据工具那头也不报；照常拉", async () => {
    let hadProgress: boolean | undefined;
    const dataTool: DataTool = {
      pull(ctx) {
        hadProgress = ctx.progress !== undefined;
        ctx.progress?.("没人听");
        return Promise.resolve(SUCCESS);
      },
    };
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases, "博客", "blog", SETTINGS);

        const result = await usecases.pullData({ accountIds: [account.id] });

        expect(result.outcomes).toEqual([
          { accountId: account.id, status: "ok" },
        ]);
        expect(hadProgress).toBe(false);
      },
      { catalog: catalogForPull(), dataTool },
    );
  });

  it("进度里夹带的密钥会被抹掉", async () => {
    const dataTool = toolReporting(() => ["连接 analytics-secret 中"]);
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases, "博客", "blog", SETTINGS);
        const received: string[] = [];

        await usecases.pullData({
          accountIds: [account.id],
          onProgress: (_accountId, message) => {
            received.push(message);
          },
        });

        expect(received).toEqual(["连接 <redacted> 中"]);
      },
      { catalog: catalogForPull(), dataTool },
    );
  });

  it("调用方的回调出错：只提醒一次，拉取照常完成", async () => {
    const dataTool = toolReporting(() => ["第一条", "第二条", "第三条"]);
    const warnings: string[] = [];
    await withUseCases(
      async ({ usecases }) => {
        const account = addAccount(usecases, "博客", "blog", SETTINGS);
        let calls = 0;

        const result = await usecases.pullData({
          accountIds: [account.id],
          onProgress: () => {
            calls += 1;
            throw new Error("标准错误写不出去");
          },
        });

        expect(result.outcomes).toEqual([
          { accountId: account.id, status: "ok" },
        ]);
        expect(result.note).toBe("全部入库");
        expect(calls).toBe(3);
        expect(warnings).toEqual([
          `账号 ${account.id} 的拉取进度回调出错，已忽略：标准错误写不出去`,
        ]);
      },
      {
        catalog: catalogForPull(),
        dataTool,
        warn: (message) => warnings.push(message),
      },
    );
  });
});
