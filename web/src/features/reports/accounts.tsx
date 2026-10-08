"use client"

import { cn } from "cn"
import { Users } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { Delta } from "@/components/base/delta"
import { EmptyState } from "@/components/base/empty-state"
import { ProgressMeter } from "@/components/base/progress-meter"
import { formatCount } from "@/lib/format"
import { shortTitle, weekReport } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { useReportWeek } from "@/state/report-week"

/** 表头：数字列右对齐，账号和最佳作品靠左 */
const COLUMNS: { label: string; align: "left" | "right" }[] = [
  { label: "账号", align: "left" },
  { label: "粉丝", align: "right" },
  { label: "增减", align: "right" },
  { label: "发布 / 目标", align: "right" },
  { label: "阅读", align: "right" },
  { label: "互动", align: "right" },
  { label: "最佳作品", align: "left" },
]

const HEAD_ALIGN = { left: "text-left", right: "text-right" } as const

const BEST_LINK = cn("block max-w-[200px] truncate rounded-sm text-xs hover:underline", focusRing)

/** 分账号：一行一个号，横着比粉丝、发布、阅读和互动；最后一行是合计 */
export function ReportAccounts() {
  const week = useReportWeek((state) => state.week)
  const report = useMemo(() => weekReport(week), [week])
  const { rows, totals } = report

  return (
    <section
      id="accounts"
      aria-labelledby="report-accounts-title"
      className="overflow-hidden rounded-lg border border-line bg-card shadow-sm"
    >
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Users className="size-4 text-fg-2" aria-hidden />
        <h2 id="report-accounts-title" className="text-sm font-medium">
          分账号
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="这一周还没有账号" />
      ) : (
        // 表格比手机屏宽，放进横向滚动的容器，页面本身不横向溢出
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-raised text-xs text-fg-2">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className={cn("h-8 px-3 font-normal", HEAD_ALIGN[column.align])}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.account.id} data-report-row={row.account.id} className="h-10 border-t border-line">
                  <td className="px-3">
                    <AccountTag account={row.account} size="md" showPlatform />
                  </td>
                  <td className="px-3 text-right whitespace-nowrap">
                    <span className="tabular text-fg-2">{formatCount(row.followersStart)} → </span>
                    <span className="tabular">{formatCount(row.followersEnd)}</span>
                  </td>
                  <td className="px-3 text-right">
                    <Delta value={row.delta} kind="count" />
                  </td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {/* 只有运营中的号有目标；筹备中的号只显示发了几篇 */}
                    {row.target > 0 ? (
                      <span className="inline-flex items-center gap-1.5 tabular">
                        {row.posts}/{row.target}
                        <ProgressMeter value={row.posts / row.target} />
                      </span>
                    ) : (
                      <span className="tabular text-fg-2">{row.posts}</span>
                    )}
                  </td>
                  <td className="px-3 text-right tabular">{formatCount(row.reads)}</td>
                  <td className="px-3 text-right tabular text-fg-2">{formatCount(row.interactions)}</td>
                  <td className="px-3">
                    {row.best ? (
                      <Link href={`/works/?open=${row.best.item.work.id}`} className={BEST_LINK} title={row.best.item.work.title}>
                        {shortTitle(row.best.item.work.title)}
                      </Link>
                    ) : (
                      <span className="text-xs text-fg-2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-report-total className="h-10 border-t border-line-2 bg-raised font-medium">
                <td className="px-3">合计</td>
                <td className="px-3" />
                <td className="px-3 text-right">
                  <Delta value={totals.delta} kind="count" />
                </td>
                <td className="px-3 text-right tabular whitespace-nowrap">
                  {totals.posts}/{totals.target}
                </td>
                <td className="px-3 text-right tabular">{formatCount(totals.reads)}</td>
                <td className="px-3 text-right tabular">{formatCount(totals.interactions)}</td>
                <td className="px-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

export default ReportAccounts
