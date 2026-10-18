import type {
  CandidatePayload,
  GatherReport,
  IdeaCandidate,
  UseCases,
} from "@leafpress/core";
import { describe, expect, it, vi } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeListCandidates,
  executeSkipCandidates,
  parseTopics,
  renderGatherReport,
  run,
} from "../../src/cli/commands/ideas.js";
import { renderCandidatePool } from "../../src/cli/commands/ideas-candidates-render.js";
import { LeafPressError } from "../../src/shared/errors.js";

function candidate(
  payload: CandidatePayload,
  details: Partial<IdeaCandidate> = {},
): IdeaCandidate {
  return {
    id: "c-1",
    key: "test-key",
    kind: payload.kind,
    title: "测试标题",
    score: 10,
    state: "new",
    payload,
    firstSeenAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...details,
  };
}

const question = candidate(
  {
    kind: "question",
    questionId: "1930045319153952064",
    via: ["personal", "topic", "blog", "hot"],
    topics: ["AI 编程"],
    blogWorkIds: ["b-3"],
    answerSummaries: ["可以通过环境变量把模型换成不同的大模型。"],
    relatedWorkIds: ["b-3"],
  },
  {
    id: "c-12",
    title: "如何让 claude code 自由选择不同的大模型？",
    url: "https://www.zhihu.com/question/1930045319153952064",
  },
);

const followup = candidate(
  {
    kind: "followup",
    workId: "z-20",
    platform: "zhihu",
    growth: 116,
    reach: 1_283_000,
    interactions: 12,
  },
  {
    id: "c-30",
    title: "人的大脑会不会出现「过拟合」病?",
    url: "https://www.zhihu.com/answer/123",
  },
);

const devlog = candidate(
  {
    kind: "devlog",
    repo: "LeafPress",
    path: "C:/code/LeafPress",
    week: "2026-W43",
    commits: [
      "fix(platforms): 小红书出图偶发失败",
      "feat(ideas): 整理候选池",
      "test(cli): 覆盖 JSON 输出",
      "不应显示的第四条提交",
    ],
    logs: [{ file: "2026-10-19.md", headings: ["完成候选池"] }],
  },
  { id: "c-41", title: "LeafPress" },
);

const report: GatherReport = {
  sources: [
    {
      name: "知乎主题推荐",
      found: 30,
      added: 18,
      warning: "部分问题接口暂时不可用",
    },
    { name: "已发作品", found: 1, added: 1 },
  ],
  pool: [question],
};

function fakeUseCases(value: object): UseCases {
  return value as unknown as UseCases;
}

function contextFor(useCases: object, json = false) {
  return createCliContext(json ? { json: true } : {}, {
    env: {},
    homedir: ".",
    useCases: fakeUseCases(useCases),
  });
}

async function capture(runCommand: () => Promise<void>) {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr += chunk.toString();
    return true;
  };
  try {
    await runCommand();
    return { stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("跑灵感命令", () => {
  it("主题词解析支持中英文逗号并去掉空项", () => {
    expect(parseTopics(" AI 编程,, 写作， ，产品 ")).toEqual([
      "AI 编程",
      "写作",
      "产品",
    ]);
    expect(parseTopics(undefined)).toBeUndefined();
  });

  it("gather 把主题词传给用例，进度写到标准错误且 JSON 只有报告字段", async () => {
    const gatherIdeas = vi.fn(
      (input?: {
        topics?: string[];
        onProgress?: (message: string) => void;
      }) => {
        input?.onProgress?.("知乎：主题推荐…");
        return Promise.resolve(report);
      },
    );
    const context = contextFor({ gatherIdeas }, true);
    const output = await capture(() =>
      run(context, ["gather", { topics: "AI 编程，, 写作,," }]),
    );

    expect(gatherIdeas).toHaveBeenCalledOnce();
    const input = gatherIdeas.mock.calls[0]?.[0];
    expect(input?.topics).toEqual(["AI 编程", "写作"]);
    expect(input?.onProgress).toBeTypeOf("function");
    expect(output.stderr).toBe("知乎：主题推荐…\n");
    expect(JSON.parse(output.stdout)).toEqual({
      ok: true,
      sources: report.sources,
      pool: report.pool,
    });
  });

  it("来源行显示找到数、新进池数和可选警告", () => {
    const lines = renderGatherReport({ ...report, pool: [] }).split("\n");
    expect(lines).toEqual([
      "知乎主题推荐：找到 30 条，新进池 18 条，警告：部分问题接口暂时不可用",
      "已发作品：找到 1 条，新进池 1 条",
      "",
      "候选池为空",
    ]);
  });

  it("候选池按问题、续写、开发记录分段并展示各自摘要", () => {
    const rendered = renderCandidatePool([devlog, followup, question]);
    expect(rendered).toContain(
      "问题\n  c-12  如何让 claude code 自由选择不同的大模型？",
    );
    expect(rendered).toContain(
      "按账号推荐 · 主题：AI 编程 · 博客反找：b-3 · 热榜",
    );
    expect(rendered).toContain("相关作品：b-3");
    expect(rendered).toContain(
      "已有回答：可以通过环境变量把模型换成不同的大模型。",
    );
    expect(rendered).toContain("续写\n  c-30  人的大脑会不会出现「过拟合」病?");
    expect(rendered).toContain("知乎 · 近 7 天 +116 · 累计 128.3万");
    expect(rendered).toContain("开发记录\n  c-41  LeafPress");
    expect(rendered).toContain("本周 4 次提交、1 份进度流水");
    expect(rendered).toContain("fix(platforms): 小红书出图偶发失败");
    expect(rendered).not.toContain("不应显示的第四条提交");
  });

  it("candidates 解析状态并输出 { ok, candidates }", async () => {
    const listCandidates = vi.fn(() => [question]);
    const candidates = executeListCandidates(
      fakeUseCases({ listCandidates }),
      "new,suggested",
    );
    expect(candidates).toEqual([question]);
    expect(listCandidates).toHaveBeenCalledWith({
      state: ["new", "suggested"],
    });

    const context = contextFor({ listCandidates }, true);
    const output = await capture(() =>
      run(context, ["candidates", { state: "new" }]),
    );
    expect(JSON.parse(output.stdout)).toEqual({
      ok: true,
      candidates: [question],
    });
    expect(output.stderr).toBe("");
    expect(() =>
      executeListCandidates(fakeUseCases({ listCandidates }), "new,unknown"),
    ).toThrowError(LeafPressError);
  });

  it("skip 的 JSON 结果只含成功标志和候选列表", async () => {
    const skipCandidates = vi.fn(() => [question]);
    const context = contextFor({ skipCandidates }, true);
    const output = await capture(() =>
      run(context, ["skip", ["c-12,c-30"], {}]),
    );
    expect(skipCandidates).toHaveBeenCalledWith(["c-12", "c-30"]);
    expect(JSON.parse(output.stdout)).toEqual({
      ok: true,
      candidates: [question],
    });
    expect(output.stderr).toBe("");
  });

  it("skip 支持编号和 --rest，并拒绝两种输入都给或都不给", () => {
    const skipCandidates = vi.fn(() => [question]);
    const usecases = fakeUseCases({ skipCandidates });
    expect(executeSkipCandidates(usecases, "c-1,c-2", false)).toEqual([
      question,
    ]);
    expect(skipCandidates).toHaveBeenLastCalledWith(["c-1", "c-2"]);
    expect(executeSkipCandidates(usecases, undefined, true)).toEqual([
      question,
    ]);
    expect(skipCandidates).toHaveBeenLastCalledWith("rest");
    expect(() => executeSkipCandidates(usecases, "c-1", true)).toThrowError(
      LeafPressError,
    );
    expect(() => executeSkipCandidates(usecases, " , ", false)).toThrowError(
      LeafPressError,
    );
  });
});
