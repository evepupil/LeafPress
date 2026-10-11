import type { PlatformInfo } from "../types/index.ts"

/**
 * 每个平台在「主数据」之外的第二个数：
 * - 有互动类数据项的平台（知乎的点赞、收藏、评论、分享），第二个数是这些数据项加起来的「互动」；
 * - 没有互动的平台（博客只有访问、访客），第二个数是它的第二项数据（博客的「访客」）。
 * 统计里沿用 interactions 这个字段名存第二个数，含义按平台由这里决定。
 */
export type Secondary = { kind: "interactions"; label: "互动" } | { kind: "metric"; key: string; label: string }

export function secondaryOf(platform: PlatformInfo): Secondary {
  if (platform.metrics.some((metric) => metric.interaction)) return { kind: "interactions", label: "互动" }
  const second = platform.metrics[1]
  // 只有一项数据的平台没有第二个数，按「互动」处理（值永远是 0）
  return second ? { kind: "metric", key: second.key, label: second.label } : { kind: "interactions", label: "互动" }
}

/** 从累计数里取第二个数：互动是互动类数据项之和，其余平台取第二项数据 */
export function secondaryValue(platform: PlatformInfo, totals: Readonly<Record<string, number>>): number {
  const secondary = secondaryOf(platform)
  if (secondary.kind === "metric") return totals[secondary.key] ?? 0
  return platform.metrics.filter((metric) => metric.interaction).reduce((sum, metric) => sum + (totals[metric.key] ?? 0), 0)
}

/**
 * 几个账号合在一起算第二个数时，只有「互动」能相加（访客和互动不是一回事）。
 * 选中的账号里有互动类平台：只合计这些平台，名字叫「互动」；全是访客类（只看博客）：合计访客，名字叫「访客」。
 */
export function combinedSecondary(platforms: readonly PlatformInfo[]): { label: string; includes(platform: PlatformInfo): boolean } {
  const kinds = platforms.map(secondaryOf)
  if (kinds.some((kind) => kind.kind === "interactions") || kinds.length === 0) {
    return { label: "互动", includes: (platform) => secondaryOf(platform).kind === "interactions" }
  }
  const labels = new Set(kinds.map((kind) => kind.label))
  return { label: [...labels].join(" / "), includes: () => true }
}

/** 表格里一列放几个账号各自的第二个数时的列名：都一样就用它，混在一起写「互动 / 访客」 */
export function secondaryColumnLabel(platforms: readonly PlatformInfo[]): string {
  const labels = new Set(platforms.map((platform) => secondaryOf(platform).label))
  if (labels.size === 0) return "互动"
  return [...labels].sort((a, b) => (a === "互动" ? -1 : b === "互动" ? 1 : a.localeCompare(b))).join(" / ")
}
