"use client"

import { cn } from "cn"
import { ArrowUpDown } from "lucide-react"

import { Surface } from "@/components/base/board"
import { PubChip } from "@/components/base/pub-chip"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { formatCount, formatDay } from "@/lib/format"
import type { WorkRow } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { orderPubs, type SortKey, type SortState } from "./works-workspace-model"
import { ColumnLabel } from "./works-workspace-parts"

/** 一行最多放几个版本小标签，多出来的折成「+N」 */
const VISIBLE_PUBS = 3

const HEAD_CELL = "h-8 px-3 text-left font-normal whitespace-nowrap"

/** 列表：白底表格，整行可点；「首发」「阅读」「近 7 天」三列能排序，窄屏下表格自己横向滚动 */
export function WorksTable({
  rows,
  sort,
  onSort,
  onOpen,
}: {
  rows: WorkRow[]
  sort: SortState | null
  onSort(key: SortKey): void
  onOpen(id: string): void
}) {
  return (
    <div className="p-3 pb-20 lg:pb-3">
      <Surface className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-raised text-xs text-fg-2">
              <tr>
                <th scope="col" className={HEAD_CELL}>
                  作品
                </th>
                <th scope="col" className={HEAD_CELL}>
                  栏目
                </th>
                <th scope="col" className={HEAD_CELL}>
                  版本
                </th>
                <SortableHead label="首发" sortKey="first" sort={sort} onSort={onSort} />
                <SortableHead label="阅读" sortKey="reads" sort={sort} onSort={onSort} align="right" />
                <th scope="col" className={cn(HEAD_CELL, "text-right")}>
                  互动
                </th>
                <SortableHead label="近 7 天" sortKey="growth" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <WorkTableRow key={row.work.id} row={row} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  )
}

/** 可排序的表头：点一次倒序、再点正序、第三次取消；`aria-sort` 告诉读屏当前方向 */
function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string
  sortKey: SortKey
  sort: SortState | null
  onSort(key: SortKey): void
  align?: "left" | "right"
}) {
  const active = sort?.key === sortKey
  const ariaSort = !active ? "none" : sort.dir === "desc" ? "descending" : "ascending"
  return (
    <th scope="col" aria-sort={ariaSort} className={cn(HEAD_CELL, align === "right" && "text-right")}>
      <button
        type="button"
        data-sort={sortKey}
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 rounded-sm hover:text-fg", active && "text-fg", focusRing)}
      >
        {label}
        <ArrowUpDown className="size-3" aria-hidden />
      </button>
    </th>
  )
}

function WorkTableRow({ row, onOpen }: { row: WorkRow; onOpen(id: string): void }) {
  const { work } = row
  const pubs = orderPubs(row.pubs)
  return (
    // 整行点击打开详情；标题里的按钮只为键盘可达，它的点击会冒泡到这一行
    <tr data-work-row={work.id} onClick={() => onOpen(work.id)} className="h-9 cursor-default border-t border-line hover:bg-hover">
      <td className="px-3">
        <div className="flex min-w-0 max-w-[360px] items-center gap-2">
          <WorkStatusIcon status={work.status} />
          <button type="button" className={cn("min-w-0 text-left", focusRing)}>
            <span className="block truncate">{work.title}</span>
          </button>
        </div>
      </td>
      <td className="px-3 text-xs whitespace-nowrap text-fg-2">
        <ColumnLabel work={work} />
      </td>
      <td className="px-3">
        {pubs.length === 0 ? (
          <span className="text-xs text-fg-2">—</span>
        ) : (
          <div className="flex items-center gap-1 whitespace-nowrap">
            {pubs.slice(0, VISIBLE_PUBS).map((pub) => (
              <PubChip key={pub.id} pub={pub} className="shrink-0" />
            ))}
            {pubs.length > VISIBLE_PUBS && <span className="text-xs text-fg-2">+{pubs.length - VISIBLE_PUBS}</span>}
          </div>
        )}
      </td>
      <td className="px-3 whitespace-nowrap text-fg-2 tabular">{row.firstPublishedAt ? formatDay(row.firstPublishedAt) : "—"}</td>
      <td className="px-3 text-right tabular">{row.reads > 0 ? formatCount(row.reads) : "—"}</td>
      <td className="px-3 text-right text-fg-2 tabular">{row.interactions > 0 ? formatCount(row.interactions) : "—"}</td>
      <td className="px-3 text-right tabular">{row.growth > 0 ? `+${formatCount(row.growth)}` : "—"}</td>
    </tr>
  )
}
