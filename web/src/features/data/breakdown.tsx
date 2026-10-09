import { cn } from "cn"
import { Users } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { Delta } from "@/components/base/delta"
import { accountHref, accountSummary, formatCount, formatPercent, type AccountSummary } from "@leafpress/core"
import { useAccounts, useMetricsInput } from "@/state/data"
import { focusRing } from "@/lib/styles"

const TH = "h-8 px-3 font-normal whitespace-nowrap"

/** 互动率 = 互动 ÷ 浏览；没有浏览时算不出来，显示「—」 */
function rateText(interactions: number, reads: number): string {
  return reads > 0 ? formatPercent(interactions / reads) : "—"
}

/** 分账号：多个号放在一张表里横着比，最后一行是合计 */
export function AccountBreakdown() {
  const accounts = useAccounts()
  const input = useMetricsInput()
  const summaries: AccountSummary[] = input ? accounts.map((account) => accountSummary(input, account)) : []
  // 粉丝合计只加拿得到粉丝数的账号（博客的 Umami 不给订阅数，加进去等于把「没有」当成 0）
  const followerSummaries = summaries.filter((item) => item.followersKnown)
  const followersTotal = followerSummaries.length > 0
  const total = {
    followers: followerSummaries.reduce((sum, item) => sum + item.followers, 0),
    followers7d: followerSummaries.reduce((sum, item) => sum + item.followers7d, 0),
    followers30d: followerSummaries.reduce((sum, item) => sum + item.followers30d, 0),
    reads7d: summaries.reduce((sum, item) => sum + item.reads7d, 0),
    interactions7d: summaries.reduce((sum, item) => sum + item.interactions7d, 0),
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
        {/* xl 以下表格至少 600px 宽，窄屏横向滚动；xl 起和数据来源两列并排，卡片只有约 570px，不再强制最小宽度，放得下就不出滚动条 */}
        <table className="w-full min-w-[600px] text-sm xl:min-w-0">
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
                浏览
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
                    {/* 粉丝数拿不到时三格都写「—」；Delta 传 null 就是「—」 */}
                    <td className="px-3 text-right tabular">{item.followersKnown ? formatCount(item.followers) : "—"}</td>
                    <td className="px-3 text-right">
                      <Delta value={item.followersKnown ? item.followers7d : null} kind="count" />
                    </td>
                    <td className="px-3 text-right">
                      <Delta value={item.followersKnown ? item.followers30d : null} kind="count" />
                    </td>
                    <td className="px-3 text-right">
                      <span className="flex items-center justify-end gap-1.5">
                        <span className="tabular">{formatCount(item.reads7d)}</span>
                        <Delta value={item.readsChange} />
                      </span>
                    </td>
                    <td className="px-3 text-right text-fg-2 tabular">{rateText(item.interactions7d, item.reads7d)}</td>
                  </>
                ) : (
                  // 拿数据的工具还没做：一整行写明，不用 0 冒充
                  <td colSpan={5} className="px-3 text-right text-xs text-fg-2">
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
                <Delta value={followersTotal ? total.followers7d : null} kind="count" />
              </td>
              <td className="px-3 text-right">
                <Delta value={followersTotal ? total.followers30d : null} kind="count" />
              </td>
              <td className="px-3 text-right tabular">{formatCount(total.reads7d)}</td>
              <td className="px-3 text-right text-fg-2 tabular">{rateText(total.interactions7d, total.reads7d)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default AccountBreakdown
