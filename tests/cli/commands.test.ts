import type {
  Account,
  AddIdeaInput,
  Idea,
  RunResult,
  StartResult,
  StepResult,
  UseCases,
  Work,
  WorkDetail,
} from "@leafpress/core";
import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeAccounts,
  executeAccountShow,
  executeAddAccount,
  parsePlatform,
  renderAccountShow,
  renderAccounts,
  renderAddedAccount,
} from "../../src/cli/commands/accounts.js";
import {
  executeConvert,
  renderCreated,
} from "../../src/cli/commands/convert.js";
import {
  executePullData,
  renderPullData,
} from "../../src/cli/commands/data.js";
import { executeExport, renderExport } from "../../src/cli/commands/export.js";
import {
  executeAddIdeas,
  executeIdeas,
  parseIdeaBatch,
  renderAddedIdeas,
  renderIdeas,
} from "../../src/cli/commands/ideas.js";
import {
  executeBack,
  executeFeedback,
  executeNew,
  executeRelease,
  executeRun,
  executeStep,
  parsePositiveStep,
  renderFeedbackSubmitted,
  renderReleased,
  renderStepResult,
} from "../../src/cli/commands/work-agent.js";
import {
  executeWorkNext,
  executeWorkShow,
  executeWorkStart,
  renderStarted,
} from "../../src/cli/commands/work.js";
import { executeWorks, renderWorks } from "../../src/cli/commands/works.js";
import { LeafPressError } from "../../src/shared/errors.js";

function cast<T>(value: unknown): T {
  return value as T;
}
function fakeUseCases(value: object): UseCases {
  return cast<UseCases>(value);
}

const work = cast<Work>({
  id: "w-1",
  accountId: "zhihu-1",
  title: "测试作品",
  status: "todo",
  step: 1,
  workflowId: "general-write",
});
const detail = cast<WorkDetail>({
  work,
  context: "任务说明原文",
  account: {
    id: "zhihu-1",
    platform: "zhihu",
    name: "一叶之桐",
    profile: "档案",
  },
  platform: { id: "zhihu", name: "知乎" },
  workflow: {
    id: "general-write",
    name: "通用写作",
    steps: [{ id: "draft", name: "初稿" }],
  },
});
const account = cast<Account>({
  id: "zhihu-1",
  platform: "zhihu",
  name: "一叶之桐",
  profile: "档案全文",
  profilePath: "/accounts/zhihu-1.md",
});
const idea = cast<Idea>({
  id: "i-1",
  text: "测试灵感",
  detail: "灵感细节",
  status: "inbox",
  source: "quick",
  createdAt: "2026-10-09",
});

describe("命令执行与呈现", () => {
  it("作品筛选用逗号列表映射成 UseCases 参数，分组并输出进度", async () => {
    const listWorks = vi.fn(() => [work]);
    const fake = fakeUseCases({
      listWorks,
      listAccounts: vi.fn(() => [account]),
      showWork: vi.fn(() => detail),
    });
    const context = createCliContext(
      {},
      { env: {}, homedir: ".", useCases: fake },
    );
    const result = await executeWorks(context, {
      status: "todo,waiting",
      account: "zhihu-1",
    });
    expect(listWorks).toHaveBeenCalledWith({
      status: ["todo", "waiting"],
      accountId: "zhihu-1",
    });
    expect(renderWorks(result)).toContain("待实现（1）");
    expect(renderWorks(result)).toContain("一叶之桐");
    expect(
      renderWorks({ works: [], accounts: new Map(), details: new Map() }),
    ).toBe("没有作品");
  });

  it("work show、next、start 保留原文、令牌、上下文和空队列语义", () => {
    const started = cast<StartResult>({
      message: "已接手",
      lease: { token: "secret-token", expiresAt: "2026-10-09T12:30:00.000Z" },
      detail,
    });
    const startNext = vi.fn(() => started);
    const startWork = vi.fn(() => started);
    const fake = fakeUseCases({
      showWork: vi.fn(() => detail),
      startNext,
      startWork,
    });
    expect(executeWorkShow(fake, "w-1").detail.context).toBe("任务说明原文");
    expect(executeWorkNext(fake, "zhihu-1")).toMatchObject({
      message: "已接手",
      lease: { token: "secret-token" },
    });
    expect(startNext).toHaveBeenCalledWith({ accountId: "zhihu-1" });
    expect(renderStarted(executeWorkNext(fake))).toContain(
      "推进这个作品时都要带 --lease secret-token",
    );
    expect(executeWorkStart(fake, "w-1", true).detail).toBe(detail);
    expect(startWork).toHaveBeenCalledWith({ id: "w-1", force: true });
    const empty = fakeUseCases({ startNext: vi.fn(() => undefined) });
    expect(renderStarted(executeWorkNext(empty))).toBe(
      "待实现里没有能接的作品",
    );
  });

  it("step、run、back、release、feedback 和 new 转发参数", async () => {
    const stepResult = cast<StepResult>({
      message: "下一步",
      lease: { token: "t", expiresAt: "2026-10-09T12:30:00.000Z" },
      detail,
    });
    const runResult = cast<RunResult>({
      ...stepResult,
      outcome: { kind: "fail", message: "失败" },
    });
    const stepWork = vi.fn(() => stepResult);
    const runWork = vi.fn(() => Promise.resolve(runResult));
    const backWork = vi.fn(() => stepResult);
    const createWorks = vi.fn(() => [work]);
    const fake = fakeUseCases({
      stepWork,
      runWork,
      backWork,
      releaseWork: vi.fn(() => work),
      submitFeedback: vi.fn(() => work),
      createWorks,
      listAccounts: vi.fn(() => [account]),
      showWork: vi.fn(() => detail),
    });
    expect(executeStep(fake, "w-1", "t", true)).toBe(stepResult);
    expect(stepWork).toHaveBeenCalledWith("w-1", "t", { force: true });
    expect(renderStepResult(stepResult)).toBe(
      "下一步\n租约续到 10月09日 12:30",
    );
    expect(await executeRun(fake, "w-1", "t")).toBe(runResult);
    expect(executeBack(fake, "w-1", 2, "t")).toBe(stepResult);
    expect(backWork).toHaveBeenCalledWith("w-1", "t", 2);
    expect(executeRelease(fake, "w-1", "t")).toEqual({ work });
    expect(renderReleased()).toBe("已交还，回到待实现最前面");
    expect(executeFeedback(fake, "w-1", "发布了链接")).toEqual({ work });
    expect(renderFeedbackSubmitted()).toBe("已提交，回到待实现最前面");
    const created = executeNew(fake, {
      accountIds: ["zhihu-1"],
      title: "标题",
      brief: "要求",
    });
    expect(createWorks).toHaveBeenCalledWith({
      source: { kind: "new", title: "标题" },
      accountIds: ["zhihu-1"],
      brief: "要求",
    });
    expect(renderCreated(created)).toContain(
      "已创建 w-1（知乎 · 一叶之桐，通用写作）",
    );
  });

  it("convert 用 i- 判断灵感，缺省 brief 走 defaultBrief，目标账号逗号解析由调用层传入", () => {
    const createWorks = vi.fn(() => [work]);
    const fake = fakeUseCases({
      listIdeas: vi.fn(() => [idea]),
      createWorks,
      listAccounts: vi.fn(() => [account]),
      showWork: vi.fn(() => detail),
    });
    const result = executeConvert(fake, "i-1", ["zhihu-1"]);
    expect(createWorks).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { kind: "idea", ideaId: "i-1" },
        accountIds: ["zhihu-1"],
      }),
    );
    expect(result.works).toEqual([work]);
    executeConvert(fake, "w-1", ["zhihu-1"], "自定义要求");
    expect(createWorks).toHaveBeenLastCalledWith({
      source: { kind: "work", workId: "w-1" },
      accountIds: ["zhihu-1"],
      brief: "自定义要求",
    });
  });

  it("灵感 list/add 和 stdin JSON 校验支持批量来源缺省", () => {
    const listIdeas = vi.fn(() => [idea]);
    const addIdeas = vi.fn((inputs: AddIdeaInput[]) =>
      inputs.map((input) =>
        cast<Idea>({ ...idea, text: input.text, source: input.source }),
      ),
    );
    const fake = fakeUseCases({ listIdeas, addIdeas });
    expect(executeIdeas(fake, "inbox")).toEqual([idea]);
    expect(listIdeas).toHaveBeenCalledWith({ status: ["inbox"] });
    expect(renderIdeas([idea])).toContain("测试灵感");
    expect(
      executeAddIdeas(fake, [{ text: "批量", source: "batch" }])[0]?.source,
    ).toBe("batch");
    expect(
      parseIdeaBatch('[{"text":"a"},{"text":"b","source":"quick"}]'),
    ).toEqual([
      { text: "a", source: "batch" },
      { text: "b", source: "quick" },
    ]);
    expect(renderAddedIdeas([idea])).toBe("已加 i-1：测试灵感");
    expect(() => parseIdeaBatch('{"text":"not array"}')).toThrow(
      "需要 JSON 数组",
    );
    expect(() => executeIdeas(fake, "bad")).toThrow(LeafPressError);
  });

  it("账号列表、档案详情、平台枚举、数据拉取和导出映射", async () => {
    const showAccount = vi.fn(() => ({
      account,
      setup: { state: "unfinished", gaps: ["cookie"] },
    }));
    const pullData = vi.fn(() =>
      Promise.resolve({ outcomes: [], note: "全部入库" }),
    );
    const fake = fakeUseCases({
      listAccounts: vi.fn(() => [account]),
      showAccount,
      addAccount: vi.fn(() => account),
      pullData,
      exportBackup: vi.fn(() => ({ dir: "/backups/2026" })),
    });
    const listed = executeAccounts(fake);
    expect(renderAccounts(listed)).toContain("没接完");
    const shown = executeAccountShow(fake, "zhihu-1");
    expect(renderAccountShow(shown)).toContain("档案全文");
    expect(renderAccountShow(shown)).toContain("- cookie");
    expect(parsePlatform("zhihu")).toBe("zhihu");
    expect(() => parsePlatform("medium")).toThrow(
      "blog、zhihu、bilibili、xiaohongshu",
    );
    const addedAccount = executeAddAccount(fake, {
      platform: "zhihu",
      name: "一叶之桐",
      intro: "开发者",
    });
    expect(addedAccount).toBe(account);
    expect(renderAddedAccount(addedAccount)).toBe(
      "已添加 zhihu-1，档案在 /accounts/zhihu-1.md",
    );
    const pull = { outcomes: [], note: "全部入库" };
    expect(await executePullData(fake, ["zhihu-1", "blog-1"])).toEqual(pull);
    expect(renderPullData(pull)).toBe("全部入库");
    expect(pullData).toHaveBeenCalledWith({
      accountIds: ["zhihu-1", "blog-1"],
    });
    expect(executeExport(fake)).toEqual({ dir: "/backups/2026" });
    expect(renderExport({ dir: "/backups/2026" })).toBe(
      "已导出到 /backups/2026",
    );
  });

  it("拒绝非正整数步骤", () => {
    expect(parsePositiveStep("12")).toBe(12);
    for (const value of ["0", "-1", "1.2", "1e2", "abc", undefined]) {
      expect(() => parsePositiveStep(value)).toThrow("必须是正整数");
    }
  });
});
