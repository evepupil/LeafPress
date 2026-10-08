"use client"

import { cn } from "cn"
import { FileText } from "lucide-react"
import { useMemo, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { Spinner, WorkStatusIcon } from "@/components/base/state-icons"
import { accountById } from "@/data/accounts"
import { WORK_STATUS_LABEL } from "@/data/labels"
import type { Work, WorkStatus } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { metricText } from "@/lib/metrics"
import { focusRingInset } from "@/lib/styles"
import { progressText, workflowOf } from "@/lib/work-engine"
import { useWorks } from "@/state/works"
import { DONE_PAGE_SIZE, moreCount, workColumns } from "./works-model"

/** 表头：一行六列，宽度写在表头上（表格是定宽布局） */
const COLUMNS: { label: string; className: string }[] = [
  { label: "标题", className: "text-left" },
  { label: "账号", className: "w-[150px] text-left" },
  { label: "工作流", className: "w-[120px] text-left" },
  { label: "进度", className: "w-[180px] text-left" },
  { label: "更新", className: "w-[96px] text-left" },
  { label: "阅读", className: "w-[72px] text-right" },
]

function WorkRow({ work, onOpen }: { work: Work; onOpen: (id: string) => void }) {
  const running = useWorks((state) => state.running.includes(work.id))
  const open = () => onOpen(work.id)

  return (
    <tr
      data-work-row={work.id}
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        open()
      }}
      className={cn("h-9 cursor-pointer border-t border-line transition-colors duration-(--dur-fast) hover:bg-hover", focusRingInset)}
    >
      <td className="px-3">
        <div className="flex min-w-0 items-center gap-2">
          <WorkStatusIcon status={work.status} />
          <span className="truncate text-sm text-fg" title={work.title}>
            {work.title}
          </span>
        </div>
      </td>
      <td className="px-3">
        <AccountTag account={accountById(work.accountId)} />
      </td>
      <td className="px-3">
        <span className="block truncate text-xs text-fg-2">{workflowOf(work).name}</span>
      </td>
      <td className="px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {running && <Spinner />}
          <span className={cn("truncate text-xs", work.status === "waiting" ? "text-warn" : "text-fg-2")}>{progressText(work)}</span>
        </div>
      </td>
      <td className="px-3 text-xs text-fg-2 tabular">{formatRelative(work.updatedAt)}</td>
      <td className="px-3 text-right text-xs text-fg-2 tabular">{metricText(work, "reads")}</td>
    </tr>
  )
}

function Group({
  status,
  items,
  limit,
  onShowMore,
  onOpen,
}: {
  status: WorkStatus
  items: Work[]
  limit: number
  onShowMore: () => void
  onOpen: (id: string) => void
}) {
  // 已完成的会越攒越多，默认只放前 20 行
  const shown = status === "done" ? items.slice(0, limit) : items

  return (
    <>
      <tr data-list-group={status} className="h-8 border-t border-line bg-raised">
        <th colSpan={COLUMNS.length} scope="colgroup" className="px-3 text-left font-normal">
          <span className="flex items-center gap-2">
            <WorkStatusIcon status={status} />
            <span className="text-sm font-medium text-fg">{WORK_STATUS_LABEL[status]}</span>
            <span className="text-sm text-fg-2 tabular">{items.length}</span>
          </span>
        </th>
      </tr>
      {shown.map((work) => (
        <WorkRow key={work.id} work={work} onOpen={onOpen} />
      ))}
      {shown.length < items.length && (
        <tr className="h-9 border-t border-line">
          <td colSpan={COLUMNS.length} className="px-3">
            <button
              type="button"
              data-show-more
              onClick={onShowMore}
              className={cn("h-7 rounded-md px-2 text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRingInset)}
            >
              再显示 <span className="tabular">{moreCount(items.length, shown.length)}</span> 个
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * 作品列表：按状态分四组，组内顺序和看板一样。一行一个作品，整行可点，回车也能打开。
 * 筛完一个都没有时给一句话。
 */
export function WorksList({
  works,
  status,
  onOpen,
}: {
  /** 已经按平台和搜索词筛过的作品 */
  works: Work[]
  /** 不为空时只显示这一组 */
  status: WorkStatus | null
  onOpen: (id: string) => void
}) {
  const groups = useMemo(() => workColumns(works, status), [works, status])
  const [limit, setLimit] = useState(DONE_PAGE_SIZE)

  if (groups.every((group) => group.items.length === 0)) {
    return <EmptyState icon={FileText} title="没有符合条件的作品" className="py-16" />
  }

  return (
    <div className="p-3 pb-20 lg:pb-3">
      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <thead>
              <tr className="h-8 bg-raised text-xs text-fg-2">
                {COLUMNS.map((column) => (
                  <th key={column.label} scope="col" className={cn("px-3 font-normal", column.className)}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Group
                  key={group.status}
                  status={group.status}
                  items={group.items}
                  limit={limit}
                  onShowMore={() => setLimit((current) => current + DONE_PAGE_SIZE)}
                  onOpen={onOpen}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
