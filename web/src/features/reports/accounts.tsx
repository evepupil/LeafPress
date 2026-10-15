"use client"

import { PLATFORMS, combinedSecondary, formatCount, secondaryColumnLabel, shortTitle, type WeekReport } from "@leafpress/core"
import { cn } from "cn"
import { Users } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { Delta } from "@/components/base/delta"
import { EmptyState } from "@/components/base/empty-state"
import { focusRing } from "@/lib/styles"
import { useSelectedReport } from "./use-week-report"

const HEAD_ALIGN = { left: "text-left", right: "text-right" } as const
const BEST_LINK = cn("block max-w-[200px] truncate rounded-sm text-xs hover:underline", focusRing)

/** 表头：第二个数的列名按各行账号的平台取名（知乎互动、博客访客，混着写「互动 / 访客」） */
function columns(report: WeekReport): { label: string; align: "left" | "right" }[] {
  return [
    { label: "账号", align: "left" },
    { label: "粉丝", align: "right" },
    { label: "增减", align: "right" },
    { label: "发布", align: "right" },
    { label: "浏览", align: "right" },
    { label: secondaryColumnLabel(report.rows.map((row) => PLATFORMS[row.account.platform])), align: "right" },
    { label: "最佳作品", align: "left" },
  ]
}

/** 合计的第二个数：访客和互动不能相加，只加共享规则包含的账号（有互动平台就只加互动类），一个都不包含写「—」 */
function combinedInteractions(report: WeekReport): string {
  const combined = combinedSecondary(report.rows.map((row) => PLATFORMS[row.account.platform]))
  const included = report.rows.filter((row) => combined.includes(PLATFORMS[row.account.platform]))
  if (included.length === 0) return "—"
  return formatCount(included.reduce((sum, row) => sum + row.interactions, 0))
}

export function ReportAccounts() {
  const { report } = useSelectedReport()
  if (!report) return null
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-raised text-xs text-fg-2">
              <tr>
                {columns(report).map((column) => (
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
                  {row.hasData ? (
                    <>
                      {/* 两端分别显示观测值，周初缺值时仍显示周末粉丝 */}
                      <td className="px-3 text-right whitespace-nowrap">
                        {row.followersStart !== null || row.followersEnd !== null ? (
                          <>
                            <span className="tabular text-fg-2">
                              {row.followersStart === null ? "—" : formatCount(row.followersStart)} →{" "}
                            </span>
                            <span className="tabular">{row.followersEnd === null ? "—" : formatCount(row.followersEnd)}</span>
                          </>
                        ) : (
                          <span className="text-xs text-fg-2">—</span>
                        )}
                      </td>
                      <td className="px-3 text-right">
                        <Delta value={row.delta} kind="count" />
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="px-3 text-right text-xs text-fg-2">
                      数据还没接
                    </td>
                  )}
                  <td className="px-3 text-right tabular">{row.posts}</td>
                  <td className="px-3 text-right tabular">{row.hasData ? formatCount(row.reads) : "—"}</td>
                  <td className="px-3 text-right tabular text-fg-2">{row.hasData ? formatCount(row.interactions) : "—"}</td>
                  <td className="px-3">
                    {row.best ? (
                      <Link href={`/?open=${row.best.item.work.id}`} className={BEST_LINK} title={row.best.item.work.title}>
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
                  {/* 周初、周末没有完整观测的账号不参与粉丝合计 */}
                  <Delta value={totals.delta} kind="count" />
                </td>
                <td className="px-3 text-right tabular whitespace-nowrap">{totals.posts}</td>
                <td className="px-3 text-right tabular">{formatCount(totals.reads)}</td>
                {/* 合计只加互动类账号，博客的访客看它自己那行 */}
                <td className="px-3 text-right tabular">{combinedInteractions(report)}</td>
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
