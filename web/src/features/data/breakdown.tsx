import { cn } from "cn"
import { Users } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { Delta } from "@/components/base/delta"
import { accountHref, accountSummary, formatCount, formatPercent, type AccountSummary } from "@leafpress/core"
import { useAccounts, useMetricsInput } from "@/state/data"
import { focusRing } from "@/lib/styles"
import { breakdownSecondaryLabel, combinedSecondary7d, hasInteractionRate } from "./breakdown-labels"

const TH = "h-8 px-3 font-normal whitespace-nowrap"

/** 互动率 = 互动 ÷ 浏览；没有浏览时算不出来，显示「—」。第二个数不是互动的平台（博客的访客）没有互动率，也写「—」 */
function rateText(interactions: number, reads: number): string {
  return reads > 0 ? formatPercent(interactions / reads) : "—"
}

/** 分账号：多个号放在一张表里横着比，最后一行是合计 */
export function AccountBreakdown() {
  const accounts = useAccounts()
  const input = useMetricsInput()
  const summaries: AccountSummary[] = input ? accounts.map((account) => accountSummary(input, account)) : []
  // 合计只加有当前粉丝观测的账号；增减分别只加起止两天都有观测的账号
  const followerSummaries = summaries.filter((item) => item.followers !== null)
  const follower7dSummaries = summaries.filter((item) => item.followers7d !== null)
  const follower30dSummaries = summaries.filter((item) => item.followers30d !== null)
  const followersTotal = followerSummaries.length > 0
  // 第二个数的列名和合计：知乎是互动、博客是访客，混着写「互动 / 访客」，合计只加共享规则包含的账号（见 breakdown-labels.ts）
  const secondaryLabel = breakdownSecondaryLabel(summaries)
  const secondaryTotal = combinedSecondary7d(summaries)
  const total = {
    followers: followerSummaries.reduce((sum, item) => sum + (item.followers ?? 0), 0),
    followers7d: follower7dSummaries.length > 0 ? follower7dSummaries.reduce((sum, item) => sum + (item.followers7d ?? 0), 0) : null,
    followers30d: follower30dSummaries.length > 0 ? follower30dSummaries.reduce((sum, item) => sum + (item.followers30d ?? 0), 0) : null,
    reads7d: summaries.reduce((sum, item) => sum + item.reads7d, 0),
  }

  return (
    <section id="breakdown" aria-labelledby="breakdown-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Users className="size-4 text-fg-2" aria-hidden />
        <h2 id="breakdown-title" className="text-sm font-medium">
          分账号
        </h2>
        <span className="text-xs text-fg-2">近 7 天</span>
      </div>
      <div className="overflow-x-auto">
        {/* xl 以下表格至少 680px 宽，窄屏横向滚动；xl 起和数据来源两列并排，卡片只有约 570px，不再强制最小宽度，放得下就不出滚动条 */}
        <table className="w-full min-w-[680px] text-sm xl:min-w-0">
          <thead className="bg-raised text-xs text-fg-2">
            <tr>
              <th scope="col" className={cn(TH, "text-left")}>
                账号
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                粉丝
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                7 天
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                30 天
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                {secondaryLabel}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                互动率
              </th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((item) => (
              <tr key={item.account.id} data-breakdown-row={item.account.id} className="h-10 border-t border-line">
                <td className="px-3">
                  <Link href={accountHref(item.account.id)} className={focusRing}>
                    <AccountTag account={item.account} size="md" showPlatform />
                  </Link>
                </td>
                {item.hasData ? (
                  <>
                    {/* 每项只在对应日期有观测时显示；Delta 会将不可计算的增减显示为「—」 */}
                    <td className="px-3 text-right tabular">{item.followers === null ? "—" : formatCount(item.followers)}</td>
                    <td className="px-3 text-right">
                      <Delta value={item.followers7d} kind="count" />
                    </td>
                    <td className="px-3 text-right">
                      <Delta value={item.followers30d} kind="count" />
                    </td>
                    <td className="px-3 text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="tabular">{formatCount(item.reads7d)}</span>
                        <Delta value={item.readsChange} />
                      </span>
                    </td>
                    {/* 每行是它自己的第二个数：知乎的互动、博客的访客，列名混着写「互动 / 访客」 */}
                    <td className="px-3 text-right text-fg-2 tabular">{formatCount(item.interactions7d)}</td>
                    {/* 第二个数不是互动的平台没有互动率（访客÷访问不是互动率），写「—」 */}
                    <td className="px-3 text-right text-fg-2 tabular">
                      {hasInteractionRate(item) ? rateText(item.interactions7d, item.reads7d) : "—"}
                    </td>
                  </>
                ) : (
                  // 拿数据的工具还没做：一整行写明，不用 0 冒充
                  <td colSpan={6} className="px-3 text-right text-xs text-fg-2">
                    数据还没接
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-breakdown-total className="h-10 border-t border-line-2 bg-raised font-medium">
              <td className="px-3 text-left">合计</td>
              <td className="px-3 text-right tabular">{followersTotal ? formatCount(total.followers) : "—"}</td>
              <td className="px-3 text-right">
                <Delta value={total.followers7d} kind="count" />
              </td>
              <td className="px-3 text-right">
                <Delta value={total.followers30d} kind="count" />
              </td>
              <td className="px-3 text-right tabular">{formatCount(total.reads7d)}</td>
              {/* 合计只加共享规则包含的账号（有互动平台就只加互动类，博客的访客看它自己那行），一个都不包含写「—」 */}
              <td className="px-3 text-right tabular">{secondaryTotal === null ? "—" : formatCount(secondaryTotal)}</td>
              {/* 合计的互动率只在选中的账号里有互动类平台时才有意义 */}
              <td className="px-3 text-right text-fg-2 tabular">
                {summaries.some(hasInteractionRate) && secondaryTotal !== null ? rateText(secondaryTotal, total.reads7d) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default AccountBreakdown
