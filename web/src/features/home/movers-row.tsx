import { cn } from "cn"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { PlatformMark } from "@/components/base/marks"
import { formatCount, formatPercent } from "@/lib/format"
import type { RankedPub } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/**
 * 涨得快榜单的一行：名次、作品、账号、近 7 天新增阅读、累计阅读、互动率。
 * 近 7 天没有新增显示「—」；没有阅读就算不出互动率，同样显示「—」。
 * 窄屏先藏账号和互动率两列，作品标题太长时截断，完整标题放在 title 里。
 */
export function MoverRow({ item, rank }: { item: RankedPub; rank: number }) {
  return (
    <tr data-mover-row data-pub={item.pub.id} className="h-9 border-t border-line transition-colors duration-(--dur-fast) hover:bg-hover">
      <td className="px-3 text-xs text-fg-2 tabular">{rank}</td>
      <td className="px-3">
        <Link
          href={`/works/?open=${item.work.id}`}
          title={item.work.title}
          className={cn("flex min-w-0 max-w-[320px] items-center gap-1.5", focusRing)}
        >
          <PlatformMark platform={item.account.platform} size={14} />
          <span className="truncate">{item.work.title}</span>
        </Link>
      </td>
      <td className="hidden px-3 md:table-cell">
        <AccountTag account={item.account} />
      </td>
      <td className={cn("px-3 text-right tabular", item.growth === 0 && "text-fg-2")}>
        {item.growth === 0 ? "—" : formatCount(item.growth)}
      </td>
      <td className="px-3 text-right tabular text-fg-2">{formatCount(item.reads)}</td>
      <td className="hidden px-3 text-right tabular text-fg-2 sm:table-cell">{item.rate === null ? "—" : formatPercent(item.rate)}</td>
    </tr>
  )
}
