import type { IdeaCandidate, QuestionVia } from "@leafpress/core";
import { formatCount, PLATFORMS } from "@leafpress/core";
import { tableCell } from "../output.js";

const VIA_LABELS: Record<QuestionVia, string> = {
  personal: "按账号推荐",
  topic: "主题",
  blog: "博客反找",
  hot: "热榜",
};

function questionSource(candidate: IdeaCandidate): string {
  if (candidate.payload.kind !== "question") return "";
  const { via, topics, blogWorkIds } = candidate.payload;
  const labels: string[] = [];
  if (via.includes("personal")) labels.push(VIA_LABELS.personal);
  for (const topic of topics) labels.push(`${VIA_LABELS.topic}：${topic}`);
  for (const workId of blogWorkIds)
    labels.push(`${VIA_LABELS.blog}：${workId}`);
  if (via.includes("hot")) labels.push(VIA_LABELS.hot);
  return labels.join(" · ");
}

function candidateLines(candidate: IdeaCandidate): string[] {
  const lines = [`  ${candidate.id}  ${tableCell(candidate.title, 72)}`];
  switch (candidate.payload.kind) {
    case "question": {
      const source = questionSource(candidate);
      if (source) lines.push(`        ${tableCell(source, 72)}`);
      if (candidate.url) lines.push(`        ${tableCell(candidate.url, 88)}`);
      if (candidate.payload.relatedWorkIds.length > 0) {
        lines.push(
          `        相关作品：${candidate.payload.relatedWorkIds.join("、")}`,
        );
      }
      const summary = candidate.payload.answerSummaries[0];
      if (summary !== undefined) {
        lines.push(`        已有回答：${tableCell(summary, 60)}`);
      }
      break;
    }
    case "followup":
      lines.push(
        `        ${PLATFORMS[candidate.payload.platform].name} · 近 7 天 +${formatCount(candidate.payload.growth)} · 累计 ${formatCount(candidate.payload.reach)}`,
      );
      if (candidate.url) lines.push(`        ${tableCell(candidate.url, 88)}`);
      break;
    case "devlog": {
      lines.push(
        `        本周 ${candidate.payload.commits.length} 次提交、${candidate.payload.logs.length} 份进度流水`,
      );
      for (const commit of candidate.payload.commits.slice(0, 3)) {
        lines.push(`        ${tableCell(commit, 72)}`);
      }
      break;
    }
  }
  return lines;
}

export function renderCandidatePool(
  candidates: readonly IdeaCandidate[],
): string {
  const sections: { kind: IdeaCandidate["kind"]; title: string }[] = [
    { kind: "question", title: "问题" },
    { kind: "followup", title: "续写" },
    { kind: "devlog", title: "开发记录" },
  ];
  const lines: string[] = [];
  for (const section of sections) {
    const matching = candidates.filter((item) => item.kind === section.kind);
    if (matching.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(section.title);
    for (const candidate of matching) lines.push(...candidateLines(candidate));
  }
  return lines.length === 0 ? "候选池为空" : lines.join("\n");
}
