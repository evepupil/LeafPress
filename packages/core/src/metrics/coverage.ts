import type { DayKey, MetricsDataset } from "../types/index.ts"
import type { MetricsInput } from "./types.ts"

/**
 * 这个账号有没有拿到过粉丝数：数据集里只要有一天的粉丝不是空的就算。
 * 博客只接了 Umami，Umami 给访问数、不给订阅数，每天的粉丝都是空的。followersAt 对这种号返回 0，
 * 那个 0 是「拿不到」，不是「0 个订阅」。所有显示粉丝或粉丝增减的地方先看这个，拿不到就写「—」。
 */
export function followersKnown(dataset: MetricsDataset, accountId: string): boolean {
  return (dataset.daily[accountId] ?? []).some((point) => point.followers !== null)
}

/**
 * 这个账号最后一天有数的日期；窗口里没有记录返回 null。
 *
 * 读的是数据集整理时记下的真实记录的最后一天（lastDays），不靠 daily 去猜：daily 把最后一次拉取之后的天补成 0，
 * 最后一次拉取在 3 天前时，后面 3 天是补出来的，单看走势会误以为在下滑；而博客某天拉到了、可访问确实是 0，
 * 也是真实记录，要算数据到这天。两种情况只有看记录行才分得清。
 */
export function lastDataDay(dataset: MetricsDataset, accountId: string): DayKey | null {
  return dataset.lastDays[accountId] ?? null
}

/**
 * 选中的账号里有没有数：账号自己每天有点，或者名下作品每天有新增，有一个就算有。
 * 数据页顶上写「截至 X」还是「暂无数据」，命令行 data show 要不要往下输出走势和排行，都看这一个，两边口径一样。
 * accountIds 不传就看全部账号；传了就只看这几个（命令行 --account 指定一个号时用）。
 */
export function hasMetricsData(input: MetricsInput, accountIds?: readonly string[]): boolean {
  const { dataset, works } = input
  const ids = new Set(accountIds ?? input.accounts.map((account) => account.id))
  for (const id of ids) {
    if ((dataset.daily[id]?.length ?? 0) > 0) return true
  }
  return works.some((work) => ids.has(work.accountId) && (dataset.workDays[work.id]?.length ?? 0) > 0)
}
