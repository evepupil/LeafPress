import { cn } from "cn"
import { Target } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { ColorDot } from "@/components/base/marks"
import { ProgressMeter } from "@/components/base/progress-meter"
import { ACCOUNTS } from "@/data/accounts"
import { LATEST_DAY, addDays } from "@/data/clock"
import type { DayKey } from "@/data/types"
import { PUBLICATIONS } from "@/data/works"
import { formatCount, formatPercent } from "@/lib/format"
import { summaryOf } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/** 「近 N 天」的 N：窗口从最新一天往前数，含最新一天 */
const RECENT_DAYS = 30
/** 「写给谁」最多列出几项，其余折成 +N */
const AUDIENCE_SHOWN = 2

/**
 * 表头文字和列宽。固定布局下，短列写死宽度、表头和数字都不换行。
 * 账号列留足 200px，名字和「· 平台名」都能完整显示。
 * 「定位」「写给谁」两列写成百分比（45% / 25%），只当比例用：写死宽度的列先占走自己那份，
 * 这两列的百分比加起来比剩下的地方大，浏览器会按比例缩小，结果是剩下的地方按 45:25 分给它们，「定位」分到的最多。
 * 装不下的文字用省略号收尾（悬停看全文）。容器不够 760px 时整张表横向滚动，不再继续挤。
 */
const COLUMNS = [
  { label: "账号", width: "w-[200px]" },
  { label: "定位", width: "w-[45%]" },
  { label: "写给谁", width: "w-[25%]" },
  { label: "栏目", width: "w-[92px]" },
  { label: "每周目标", width: "w-[76px]" },
  { label: `近 ${RECENT_DAYS} 天`, width: "w-[76px]" },
  { label: "粉丝目标", width: "w-[140px]" },
]

/** 这个号在 [from, 最新一天] 里已发的版本数 */
function publishedSince(accountId: string, from: DayKey): number {
  return PUBLICATIONS.filter(
    (pub) =>
      pub.accountId === accountId &&
      pub.state === "published" &&
      pub.publishedAt !== undefined &&
      pub.publishedAt >= from &&
      pub.publishedAt <= LATEST_DAY,
  ).length
}

/** 前两项用「、」连起来；多出来的项数单独返回，界面上写成 +N */
function audienceParts(audience: string[]): { shown: string; rest: number } {
  return {
    shown: audience.slice(0, AUDIENCE_SHOWN).join("、"),
    rest: Math.max(0, audience.length - AUDIENCE_SHOWN),
  }
}

/** A2 方向对照：把各账号的定位、读者、栏目、节奏和粉丝目标排成一张表，横着比 */
export function DirectionMatrix() {
  const from = addDays(LATEST_DAY, 1 - RECENT_DAYS)
  return (
    <section id="directions" aria-labelledby="directions-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Target className="size-4 text-fg-2" aria-hidden />
        <h2 id="directions-title" className="text-sm font-medium">
          方向对照
        </h2>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <thead className="bg-raised text-xs text-fg-2">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.label} scope="col" className={cn("h-8 px-3 text-left font-normal whitespace-nowrap", column.width)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACCOUNTS.map((a) => {
              const recent = publishedSince(a.id, from)
              const { goalProgress } = summaryOf(a.id)
              const { shown, rest } = audienceParts(a.audience)
              return (
                <tr key={a.id} data-direction-row={a.id} className="h-10 border-t border-line">
                  <td className="px-3">
                    <Link href={`/accounts/${a.id}/`} className={focusRing}>
                      <AccountTag account={a} size="md" showPlatform />
                    </Link>
                  </td>
                  <td className="px-3">
                    <span className="block truncate text-fg-2" title={a.positioning}>
                      {a.positioning}
                    </span>
                  </td>
                  <td className="px-3">
                    {/* 文字最多两行；「+N」单独放在右下角，文字被截断时它也一直看得见，悬停看全名单 */}
                    <span className="flex items-end gap-1 text-xs text-fg-2" title={a.audience.join("、")}>
                      <span className="line-clamp-2 min-w-0">{shown}</span>
                      {rest > 0 && <span className="shrink-0 tabular">{` +${rest}`}</span>}
                    </span>
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1" title={a.columns.map((column) => column.name).join("、")}>
                      {a.columns.map((column) => (
                        <ColorDot key={column.id} color={column.color} />
                      ))}
                      <span className="text-xs text-fg-2 tabular">{a.columns.length}</span>
                    </span>
                  </td>
                  <td className="px-3 whitespace-nowrap tabular">{`${a.goals.postsPerWeek} 篇`}</td>
                  {/* 没发过显示 0，文字降成次要色 */}
                  <td className={cn("px-3 whitespace-nowrap tabular", recent === 0 && "text-fg-2")} data-direction-recent>
                    {recent}
                  </td>
                  <td className="px-3">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <ProgressMeter value={goalProgress} />
                      <span className="text-xs tabular">{formatPercent(goalProgress)}</span>
                      <span className="text-xs text-fg-2 tabular">{`/ ${formatCount(a.goals.followers)}`}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default DirectionMatrix
