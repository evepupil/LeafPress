import { PLATFORMS, type Account } from "@leafpress/core";

/**
 * 表头里「主数据」的叫法：账号都是同一个平台时用它自己的叫法（浏览、访问、播放），
 * 混着几个平台就统一叫「主数据」；一个账号都没有时按「浏览」。
 */
export function primaryMetricLabel(accounts: readonly Account[]): string {
  const labels = new Set(
    accounts.map(
      (account) => PLATFORMS[account.platform].metrics[0]?.label ?? "浏览",
    ),
  );
  if (labels.size === 1) return labels.values().next().value ?? "浏览";
  return labels.size === 0 ? "浏览" : "主数据";
}
