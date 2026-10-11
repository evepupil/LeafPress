import { PLATFORMS, combinedSecondary, secondaryColumnLabel, secondaryOf, type AccountSummary } from "@leafpress/core"

/**
 * 第二个数（统计里叫 interactions）按平台含义不同：知乎是互动、博客是访客。
 * 这里的几个纯函数管它怎么取名、能不能相加、互动率算不算得出来；界面见 breakdown.tsx。
 */

/** 列名：一列里放几个账号各自的第二个数时，都一样用它的名字，混着写「互动 / 访客」 */
export function breakdownSecondaryLabel(summaries: readonly AccountSummary[]): string {
  return secondaryColumnLabel(summaries.map((item) => PLATFORMS[item.account.platform]))
}

/** 互动率只对第二个数是互动的平台有意义：访客 ÷ 访问不是互动率，这种行写「—」（reads 为 0 也写「—」） */
export function hasInteractionRate(summary: AccountSummary): boolean {
  return secondaryOf(PLATFORMS[summary.account.platform]).kind === "interactions"
}

/**
 * 合计行的第二个数：访客和互动不能相加，共享规则决定只合计哪些账号（有互动平台就只合计互动类）。
 * 返回 null 表示选中的账号没有一个算进合计。
 */
export function combinedSecondary7d(summaries: readonly AccountSummary[]): number | null {
  const combined = combinedSecondary(summaries.map((item) => PLATFORMS[item.account.platform]))
  const included = summaries.filter((item) => combined.includes(PLATFORMS[item.account.platform]))
  if (included.length === 0) return null
  return included.reduce((sum, item) => sum + item.interactions7d, 0)
}
