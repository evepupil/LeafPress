/**
 * 博客原稿的头部元数据：校验与规整。
 *
 * 原理：gray-matter 负责切开 frontmatter，YAML 用 js-yaml 的 JSON_SCHEMA 解析
 * （引擎在 source-provider.ts 里注入），不加引号的日期保持字符串，不会被转成日期对象；
 * 这里用 zod 校验字段类型，再把「规整后」的值变成 SourceSummary 需要的形状。
 * 允许出现未列出的字段（z.looseObject），但列出的字段类型错了要报出中文问题。
 * 校验不过不抛异常，返回 ok: false 和一条给人看的问题说明，由调用方记进 issues。
 */
import { z } from "zod";

/** 规整后的元数据（不含正文和文件信息） */
export interface BlogFrontmatterMeta {
  title: string;
  description?: string;
  /** YYYY-MM-DD */
  publishedAt: string;
  /** YYYY-MM-DD */
  updatedAt?: string;
  locale: string;
  tags: string[];
  draft: boolean;
  translationKey?: string;
  /** 文章最初写在哪：notion 表示由 Notion 同步进仓库，repo 表示直接写在仓库里 */
  origin: "notion" | "repo";
}

export type FrontmatterResult =
  { ok: true; meta: BlogFrontmatterMeta } | { ok: false; message: string };

/** 完整的 YYYY-MM-DD：多一位少一位都不要（拒绝 2026-03-04oops） */
const FULL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 完整合法的 ISO 时间：日期 + T + 时分秒（范围要校验）+ 可选时区（Z 或 ±HH:MM） */
const ISO_DATETIME_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})?$/;

/** 日期字段：完整的 YYYY-MM-DD，或完整合法的 ISO 时间 */
const dateValueSchema = z
  .string({ error: "必须是 YYYY-MM-DD 日期（字符串）" })
  .refine(
    (value) =>
      FULL_DATE_RE.test(value) ||
      (ISO_DATETIME_RE.test(value) && isIsoTimeValid(value)),
    { message: "不是 YYYY-MM-DD 日期" },
  );

const frontmatterSchema = z.looseObject({
  title: z
    .string({ error: "必填，必须是字符串" })
    .refine((value) => value.trim().length > 0, { message: "不能是空字符串" }),
  description: z.string({ error: "必须是字符串" }).optional(),
  published: dateValueSchema,
  updated: dateValueSchema.optional(),
  locale: z
    .string({ error: "必填，必须是字符串" })
    .refine((value) => value.trim().length > 0, {
      message: "不能是空字符串",
    }),
  tags: z
    .array(z.string({ error: "数组元素必须是字符串" }), {
      error: "必须是字符串数组",
    })
    .default([]),
  draft: z.boolean({ error: "必须是布尔值" }).default(false),
  translationKey: z.string({ error: "必须是字符串" }).optional(),
  source: z.string({ error: "必须是字符串" }).optional(),
});

/**
 * 日期部分按日历严格校验：用闰年规则手算每月天数。
 * 不经过 Date：Date.UTC 会把 0000～0099 年映射到 1900～1999 年，
 * 0029-02-29 这类日期会被误判。
 */
function isCalendarValidDate(datePart: string): boolean {
  const [yearText, monthText, dayText] = datePart.split("-");
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined
  ) {
    return false;
  }
  if (
    !/^\d{4}$/.test(yearText) ||
    !/^\d{2}$/.test(monthText) ||
    !/^\d{2}$/.test(dayText)
  ) {
    return false;
  }
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  if (month < 1 || month > 12) return false;
  // 闰年：能被 4 整除但不能被 100 整除，或能被 400 整除
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  return day >= 1 && day <= (daysInMonth ?? 0);
}

/** ISO 时间的时分秒范围校验：时 0～23、分 0～59、秒 0～59（闰秒不收），时区 ±HH:MM 的时 0～23、分 0～59 */
function isIsoTimeValid(value: string): boolean {
  const match = ISO_DATETIME_RE.exec(value);
  if (match === null) return false;
  const [, , hourText, minuteText, secondText, zoneText] = match;
  const hour = Number.parseInt(hourText ?? "", 10);
  const minute = Number.parseInt(minuteText ?? "", 10);
  const second = Number.parseInt(secondText ?? "", 10);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (zoneText !== undefined && zoneText !== "Z") {
    const zoneHour = Number.parseInt(zoneText.slice(1, 3), 10);
    const zoneMinute = Number.parseInt(zoneText.slice(4, 6), 10);
    if (zoneHour > 23 || zoneMinute > 59) return false;
  }
  return true;
}

/** 把日期值规整成 YYYY-MM-DD；不合法返回错误说明（不带字段名） */
function normalizeDate(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const datePart = value.slice(0, 10);
  if (!isCalendarValidDate(datePart)) {
    return { ok: false, message: "不是 YYYY-MM-DD 日期" };
  }
  return { ok: true, value: datePart };
}

/** 把 zod 的问题拼成一条中文说明：字段名 + 问题，多个用分号隔开 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.join(".");
      return field === "" ? issue.message : `${field}：${issue.message}`;
    })
    .join("；");
}

/** 校验并规整头部元数据；data 是 frontmatter 解析出的对象 */
export function parseFrontmatter(data: unknown): FrontmatterResult {
  const parsed = frontmatterSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, message: formatIssues(parsed.error) };
  }

  // 日历校验单独做：zod 只管字符串形状，2026-02-31 这种在这里精确拒绝
  const published = normalizeDate(parsed.data.published);
  if (!published.ok) {
    return { ok: false, message: `published：${published.message}` };
  }
  let updatedAt: string | undefined;
  if (parsed.data.updated !== undefined) {
    const updated = normalizeDate(parsed.data.updated);
    if (!updated.ok) {
      return { ok: false, message: `updated：${updated.message}` };
    }
    updatedAt = updated.value;
  }

  return {
    ok: true,
    meta: {
      title: parsed.data.title,
      description: parsed.data.description,
      publishedAt: published.value,
      updatedAt,
      locale: parsed.data.locale,
      // 可选字段缺省：tags 为空数组，draft 为 false（zod .default 已填）
      tags: parsed.data.tags,
      draft: parsed.data.draft,
      translationKey: parsed.data.translationKey,
      // source 为 "notion" 表示 Notion 同步进仓库，其他一律算直接写在仓库里
      origin: parsed.data.source === "notion" ? "notion" : "repo",
    },
  };
}
