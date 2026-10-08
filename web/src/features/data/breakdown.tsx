import { cn } from "cn"
import { Users } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { Delta } from "@/components/base/delta"
import { formatCount, formatPercent } from "@/lib/format"
import { ACCOUNT_SUMMARIES } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

const TH = "h-8 px-3 font-normal whitespace-nowrap"

/** 互动率 = 互动 ÷ 阅读；没有阅读时算不出来，显示「—」 */
function rateText(interactions: number, reads: number): string {
  return reads > 0 ? formatPercent(interactions / reads) : "—"
}

/** 分账号：多个号放在一张表里横着比，最后一行是合计 */
export function AccountBreakdown() {
  // 合计行：粉丝、涨幅、阅读、互动都是各账号相加；阅读涨跌不同账号的基数不同，合计行不给
  const total = ACCOUNT_SUMMARIES.reduce(
    (sum, item) => ({
      followers: sum.followers + item.followers,
      followers7d: sum.followers7d + item.followers7d,
      followers30d: sum.followers30d + item.followers30d,
      reads7d: sum.reads7d + item.reads7d,
      interactions7d: sum.interactions7d + item.interactions7d,
    }),
    { followers: 0, followers7d: 0, followers30d: 0, reads7d: 0, interactions7d: 0 },
  )

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
                阅读
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                互动率
              </th>
            </tr>
          </thead>
          <tbody>
            {ACCOUNT_SUMMARIES.map((item) => (
              <tr key={item.account.id} data-breakdown-row={item.account.id} className="h-10 border-t border-line">
                <td className="px-3">
                  <Link href={`/accounts/${item.account.id}/`} className={focusRing}>
                    <AccountTag account={item.account} size="md" showPlatform />
                  </Link>
                </td>
                <td className="px-3 text-right tabular">{formatCount(item.followers)}</td>
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
                <td className="px-3 text-right text-fg-2 tabular">{rateText(item.interactions7d, item.reads7d)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-breakdown-total className="h-10 border-t border-line-2 bg-raised font-medium">
              <td className="px-3 text-left">合计</td>
              <td className="px-3 text-right tabular">{formatCount(total.followers)}</td>
              <td className="px-3 text-right">
                <Delta value={total.followers7d} kind="count" />
              </td>
              <td className="px-3 text-right">
                <Delta value={total.followers30d} kind="count" />
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
