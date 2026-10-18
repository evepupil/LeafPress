import type {
  AddIdeaInput,
  CandidateState,
  GatherReport,
  Idea,
  IdeaCandidate,
  IdeaStatus,
  UseCases,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { renderTable, tableCell } from "../output.js";
import { LeafPressError } from "../../shared/errors.js";
import { renderCandidatePool } from "./ideas-candidates-render.js";
import {
  commandOptions,
  emitSuccess,
  enumValues,
  positionalText,
  requiredString,
} from "./shared.js";

const IDEA_STATUSES: readonly IdeaStatus[] = [
  "inbox",
  "promising",
  "converted",
];
const IDEA_SOURCES = [
  "quick",
  "devlog",
  "cloudmind",
  "trend",
  "bookmark",
  "batch",
  "schedule",
] as const;

const CANDIDATE_STATES: readonly CandidateState[] = [
  "new",
  "suggested",
  "skipped",
  "rejected",
];

export function parseTopics(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(/[，,]/u)
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}

export function executeGatherIdeas(
  usecases: Pick<UseCases, "gatherIdeas">,
  topics?: string[],
  onProgress?: (message: string) => void,
): Promise<GatherReport> {
  if (topics === undefined && onProgress === undefined)
    return usecases.gatherIdeas();
  return usecases.gatherIdeas({
    ...(topics === undefined ? {} : { topics }),
    ...(onProgress === undefined ? {} : { onProgress }),
  });
}

export function executeListCandidates(
  usecases: Pick<UseCases, "listCandidates">,
  state?: string,
): IdeaCandidate[] {
  const filter = enumValues(state, CANDIDATE_STATES, "候选状态");
  return usecases.listCandidates(
    filter === undefined ? undefined : { state: filter },
  );
}

export function executeSkipCandidates(
  usecases: Pick<UseCases, "skipCandidates">,
  rawIds: string | undefined,
  rest: boolean,
): IdeaCandidate[] {
  const ids = (rawIds ?? "")
    .split(/[，,\s]+/u)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (rest && ids.length > 0) {
    throw new LeafPressError("USAGE", "编号和 --rest 只能选一种。");
  }
  if (rest) return usecases.skipCandidates("rest");
  if (ids.length === 0) {
    throw new LeafPressError("USAGE", "请提供候选编号，或使用 --rest。");
  }
  return usecases.skipCandidates(ids);
}

export function renderGatherReport(report: GatherReport): string {
  const sourceLines = report.sources.map(
    (source) =>
      `${source.name}：找到 ${source.found} 条，新进池 ${source.added} 条${source.warning === undefined ? "" : `，警告：${source.warning}`}`,
  );
  const pool = renderCandidatePool(report.pool);
  return sourceLines.length === 0
    ? pool
    : [...sourceLines, "", pool].join("\n");
}

export function renderSkippedCandidates(
  candidates: readonly IdeaCandidate[],
): string {
  return `已跳过 ${candidates.length} 条`;
}

export function executeIdeas(
  usecases: Pick<UseCases, "listIdeas">,
  status?: string,
): Idea[] {
  const filter = enumValues(status, IDEA_STATUSES, "灵感状态");
  return usecases.listIdeas(
    filter === undefined ? undefined : { status: filter },
  );
}

export function renderIdeas(ideas: readonly Idea[]): string {
  if (ideas.length === 0) return "没有灵感";
  return renderTable(
    ["编号", "状态", "一句话", "来源"],
    ideas.map((idea) => [
      tableCell(idea.id, 18),
      tableCell(idea.status, 12),
      tableCell(idea.text, 40),
      tableCell(idea.sourceDetail ?? idea.source, 24),
    ]),
  );
}

export function parseIdeaBatch(raw: string): AddIdeaInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    throw new LeafPressError("USAGE", "--stdin 需要合法的 JSON 数组。");
  }
  if (!Array.isArray(parsed))
    throw new LeafPressError("USAGE", "--stdin 需要 JSON 数组。");
  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new LeafPressError(
        "USAGE",
        `--stdin 第 ${index + 1} 项必须是对象。`,
      );
    }
    const item = entry as Record<string, unknown>;
    if (typeof item["text"] !== "string")
      throw new LeafPressError(
        "USAGE",
        `--stdin 第 ${index + 1} 项缺少字符串 text。`,
      );
    for (const field of [
      "detail",
      "accountId",
      "source",
      "sourceDetail",
      "candidateId",
    ] as const) {
      if (item[field] !== undefined && typeof item[field] !== "string") {
        throw new LeafPressError(
          "USAGE",
          `--stdin 第 ${index + 1} 项的 ${field} 必须是字符串。`,
        );
      }
    }
    const source = item["source"] ?? "batch";
    if (
      typeof source !== "string" ||
      !IDEA_SOURCES.includes(source as (typeof IDEA_SOURCES)[number])
    ) {
      throw new LeafPressError(
        "USAGE",
        `--stdin 第 ${index + 1} 项 source 不合法；可选值：${IDEA_SOURCES.join("、")}`,
      );
    }
    return {
      text: item["text"],
      source: source as AddIdeaInput["source"],
      ...(typeof item["detail"] === "string" ? { detail: item["detail"] } : {}),
      ...(typeof item["accountId"] === "string"
        ? { accountId: item["accountId"] }
        : {}),
      ...(typeof item["sourceDetail"] === "string"
        ? { sourceDetail: item["sourceDetail"] }
        : {}),
      ...(typeof item["candidateId"] === "string"
        ? { candidateId: item["candidateId"] }
        : {}),
    };
  });
}

export function executeAddIdeas(
  usecases: Pick<UseCases, "addIdeas">,
  inputs: AddIdeaInput[],
): Idea[] {
  return usecases.addIdeas(inputs);
}

export function renderAddedIdeas(ideas: readonly Idea[]): string {
  return ideas
    .map(
      (idea) =>
        `已加 ${idea.id}${idea.text.length > 0 ? `：${idea.text}` : ""}`,
    )
    .join("\n");
}

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  const input: AsyncIterable<unknown> = process.stdin;
  for await (const chunk of input) {
    if (typeof chunk === "string") chunks.push(Buffer.from(chunk));
    else if (chunk instanceof Uint8Array) chunks.push(chunk);
    else throw new LeafPressError("USAGE", "--stdin 只能读取文本数据。");
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const operation = requiredString(args[0], "灵感操作");
  const options = commandOptions(args.slice(1));
  const usecases = await context.getUseCases();
  if (operation === "gather") {
    const topics = parseTopics(
      typeof options["topics"] === "string" ? options["topics"] : undefined,
    );
    // 进度不混入 stdout，避免污染 agent 读取的 --json 结果。
    const report = await executeGatherIdeas(usecases, topics, (message) => {
      process.stderr.write(`${message}\n`);
    });
    emitSuccess(
      context,
      { sources: report.sources, pool: report.pool },
      renderGatherReport(report),
    );
    return;
  }
  if (operation === "candidates") {
    const candidates = executeListCandidates(
      usecases,
      typeof options["state"] === "string" ? options["state"] : undefined,
    );
    emitSuccess(context, { candidates }, renderCandidatePool(candidates));
    return;
  }
  if (operation === "skip") {
    const ids = positionalText(args.slice(1));
    const candidates = executeSkipCandidates(
      usecases,
      ids,
      options["rest"] === true,
    );
    emitSuccess(context, { candidates }, renderSkippedCandidates(candidates));
    return;
  }
  if (operation === "list") {
    const result = executeIdeas(
      usecases,
      typeof options["status"] === "string" ? options["status"] : undefined,
    );
    emitSuccess(context, { ideas: result }, renderIdeas(result));
    return;
  }
  if (operation !== "add")
    throw new LeafPressError("USAGE", `未知 ideas 操作：${operation}`);

  let inputs: AddIdeaInput[];
  if (options["stdin"] === true) {
    inputs = parseIdeaBatch(await readStdin());
  } else {
    const text = requiredString(positionalText(args.slice(1)), "灵感内容");
    const source =
      typeof options["source"] === "string" ? options["source"] : "quick";
    if (!IDEA_SOURCES.includes(source as (typeof IDEA_SOURCES)[number])) {
      throw new LeafPressError(
        "USAGE",
        `灵感来源不合法：${source}；可选值：${IDEA_SOURCES.join("、")}`,
      );
    }
    inputs = [
      {
        text,
        source: source as AddIdeaInput["source"],
        ...(typeof options["detail"] === "string"
          ? { detail: options["detail"] }
          : {}),
        ...(typeof options["account"] === "string"
          ? { accountId: options["account"] }
          : {}),
        ...(typeof options["sourceDetail"] === "string"
          ? { sourceDetail: options["sourceDetail"] }
          : {}),
      },
    ];
  }
  const result = executeAddIdeas(usecases, inputs);
  emitSuccess(context, { ideas: result }, renderAddedIdeas(result));
}
