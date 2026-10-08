"use client"

import { cn } from "cn"
import { Eye, ThumbsUp, TrendingUp } from "lucide-react"

import { BoardColumn, CollapsedRow } from "@/components/base/board"
import { LabelChip } from "@/components/base/label-chip"
import { PubChip } from "@/components/base/pub-chip"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { WORK_STATUS_LABEL, WORK_STATUS_ORDER } from "@/data/labels"
import { formatCount, formatDay } from "@/lib/format"
import type { WorkRow } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { BOARD_PUBLISHED_LIMIT, orderPubs } from "./works-workspace-model"
import { ColumnLabel } from "./works-workspace-parts"

/** 看板：四列按作品状态分开，卡片按「最近更新」排；已发的作品多，默认只露出前 12 张 */
export function WorksBoard({
  rows,
  showAllPublished,
  onShowAll,
  onOpen,
}: {
  rows: WorkRow[]
  showAllPublished: boolean
  onShowAll(): void
  onOpen(id: string): void
}) {
  return (
    <div className="grid items-start gap-(--gap-card) p-3 pb-20 md:grid-cols-2 lg:pb-3 xl:grid-cols-4">
      {WORK_STATUS_ORDER.map((status) => {
        const inColumn = rows.filter((row) => row.work.status === status)
        const shown = status === "published" && !showAllPublished ? inColumn.slice(0, BOARD_PUBLISHED_LIMIT) : inColumn
        const hidden = inColumn.length - shown.length
        return (
          <BoardColumn
            key={status}
            icon={<WorkStatusIcon status={status} />}
            title={WORK_STATUS_LABEL[status]}
            count={inColumn.length}
            className="min-w-0"
          >
            {shown.length === 0 && <p className="px-2 py-3 text-xs text-fg-2">没有作品</p>}
            {shown.map((row) => (
              <WorkCard key={row.work.id} row={row} onOpen={onOpen} />
            ))}
            {hidden > 0 && <CollapsedRow data-works-more label={`更早的 ${hidden} 篇`} onClick={onShowAll} />}
          </BoardColumn>
        )
      })}
    </div>
  )
}

/** 作品卡片：栏目和更新日期、标题、各平台版本小标签、累计数据；整张卡片是一个按钮，点开详情抽屉 */
function WorkCard({ row, onOpen }: { row: WorkRow; onOpen(id: string): void }) {
  const { work } = row
  const pubs = orderPubs(row.pubs)
  return (
    <button
      type="button"
      data-work-card={work.id}
      onClick={() => onOpen(work.id)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color] duration-(--dur-fast) hover:border-line-3",
        focusRing,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
        <ColumnLabel work={work} />
        <span className="ml-auto shrink-0 tabular">{formatDay(work.updatedAt)}</span>
      </span>
      <span className="line-clamp-2 text-sm font-medium break-words">{work.title}</span>
      <span className="flex flex-wrap gap-1">
        {pubs.length === 0 ? <LabelChip>还没有版本</LabelChip> : pubs.map((pub) => <PubChip key={pub.id} pub={pub} />)}
      </span>
      {row.reads > 0 && (
        <span className="flex items-center gap-3 text-xs text-fg-2 tabular">
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3" aria-hidden />
            {formatCount(row.reads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ThumbsUp className="size-3" aria-hidden />
            {formatCount(row.interactions)}
          </span>
          {row.growth > 0 && (
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="size-3" aria-hidden />+{formatCount(row.growth)}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
