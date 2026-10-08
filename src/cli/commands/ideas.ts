import type { AddIdeaInput, Idea, IdeaStatus, UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import { renderTable } from "../output.js";
import { LeafPressError } from "../../shared/errors.js";
import {
  commandOptions,
  emitSuccess,
  enumValues,
  positionalArgs,
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
      idea.id,
      idea.status,
      idea.text,
      idea.sourceDetail ?? idea.source,
    ]),
  );
}

export function parseIdeaBatch(raw: string): AddIdeaInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
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
  if (operation === "list") {
    const result = executeIdeas(
      usecases,
      typeof options["status"] === "string" ? options["status"] : undefined,
    );
    emitSuccess(context, { ideas: result }, renderIdeas(result));
    return;
  }
  if (operation !== "add") throw new Error(`未知 ideas 操作：${operation}`);

  let inputs: AddIdeaInput[];
  if (options["stdin"] === true) {
    inputs = parseIdeaBatch(await readStdin());
  } else {
    const text = requiredString(positionalArgs(args.slice(1))[0], "灵感内容");
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
