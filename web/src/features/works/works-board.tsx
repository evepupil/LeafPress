"use client"

import { cn } from "cn"
import { Plus } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { toast } from "sonner"

import { BoardColumn } from "@/components/base/board"
import { DropLine, WORK_DRAG, useBoardDrop } from "@/components/base/board-dnd"
import { IconButton } from "@/components/base/icon-button"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { WORK_STATUS_LABEL } from "@/data/labels"
import type { Work, WorkStatus } from "@/data/types"
import { focusRing } from "@/lib/styles"
import { useWorks } from "@/state/works"
import { WorkCard } from "./works-card"
import {
  DONE_PAGE_SIZE,
  emptyColumnText,
  moreCount,
  workColumns,
  type TodoQueue,
  type WorkColumnData,
  type WorkHandlers,
} from "./works-model"

function Column({
  column,
  single,
  queue,
  handlers,
  onNewWork,
}: {
  column: WorkColumnData
  /** 只剩这一列（侧栏视图点进来的）：不让它撑满整行 */
  single: boolean
  queue: TodoQueue
  handlers: WorkHandlers
  onNewWork: () => void
}) {
  const { status, items } = column
  const drop = useWorks((state) => state.drop)
  const [limit, setLimit] = useState(DONE_PAGE_SIZE)
  const { over, beforeId, dropProps } = useBoardDrop(WORK_DRAG, (id, before) => {
    const result = drop(id, status, before)
    if (!result.ok) toast(result.reason)
  })
  // 已完成的会越攒越多，默认只放前 20 张
  const shown = status === "done" ? items.slice(0, limit) : items

  return (
    <div
      {...dropProps}
      data-board-column={status}
      className={cn("flex max-h-full w-[288px] shrink-0 snap-start xl:w-auto xl:min-w-[240px] xl:flex-1", single && "xl:max-w-[420px]")}
    >
      <BoardColumn
        icon={<WorkStatusIcon status={status} />}
        title={WORK_STATUS_LABEL[status]}
        count={items.length}
        className={cn("max-h-full w-full", over && "outline-2 outline-offset-[-2px] outline-dashed outline-line-3")}
        bodyClassName="scroll-thin overflow-y-auto"
        actions={
          status === "todo" ? (
            <IconButton label="新建作品" size="icon-xs" onClick={onNewWork}>
              <Plus />
            </IconButton>
          ) : undefined
        }
      >
        {items.length === 0 && <p className="px-2 pb-2 text-sm text-fg-2">{emptyColumnText(status)}</p>}
        {shown.map((work) => (
          <Fragment key={work.id}>
            {over && beforeId === work.id && <DropLine />}
            <WorkCard
              work={work}
              queuePos={status === "todo" ? queue.positions.get(work.id) : undefined}
              frontId={queue.frontId}
              handlers={handlers}
            />
          </Fragment>
        ))}
        {over && beforeId === null && <DropLine />}
        {shown.length < items.length && (
          <button
            type="button"
            data-show-more
            onClick={() => setLimit((current) => current + DONE_PAGE_SIZE)}
            className={cn("h-8 shrink-0 rounded-md text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRing)}
          >
            再显示 <span className="tabular">{moreCount(items.length, shown.length)}</span> 个
          </button>
        )}
      </BoardColumn>
    </div>
  )
}

/**
 * 作品看板：四列从左到右是 AI 的待做、AI 在做、等你做、做完了。
 * 卡片拖到别的列就改状态（拖进「进行中」就是让 AI 做），在待实现里拖动排先后；手机上横向滑，挪列靠卡片菜单。
 */
export function WorksBoard({
  works,
  status,
  queue,
  handlers,
  onNewWork,
}: {
  /** 已经按平台和搜索词筛过的作品 */
  works: Work[]
  /** 不为空时只显示这一列 */
  status: WorkStatus | null
  queue: TodoQueue
  handlers: WorkHandlers
  onNewWork: () => void
}) {
  const columns = useMemo(() => workColumns(works, status), [works, status])

  return (
    <div className="scroll-thin flex h-full min-h-0 items-start gap-(--gap-card) overflow-x-auto scroll-px-3 p-3 pb-20 lg:pb-3 max-md:snap-x max-md:snap-mandatory">
      {columns.map((column) => (
        <Column key={column.status} column={column} single={status !== null} queue={queue} handlers={handlers} onNewWork={onNewWork} />
      ))}
    </div>
  )
}
