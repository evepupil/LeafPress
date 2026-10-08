"use client"

import { cn } from "cn"
import { Hand, Workflow } from "lucide-react"
import { Fragment, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { WORK_DRAG, endCardDrag, startCardDrag } from "@/components/base/board-dnd"
import { LabelChip } from "@/components/base/label-chip"
import { Spinner, WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { accountById } from "@/data/accounts"
import type { Work } from "@/data/types"
import { formatCount } from "@/lib/format"
import { focusRing } from "@/lib/styles"
import { progressText, waitingLabel, workflowOf } from "@/lib/work-engine"
import { useWorks } from "@/state/works"
import { WorkCardMenu } from "./works-card-menu"
import { cardMetrics, cardTimeText, sourceMarkOf, type WorkHandlers } from "./works-model"

const STAT_ICON = "size-3.5 shrink-0 text-fg-3"

/** 第三行的内容，按状态不同：待实现是工作流，进行中是进度，等你处理是卡在哪一步，已完成是数据 */
function CardMeta({ work, running, onOpen }: { work: Work; running: boolean; onOpen: (id: string) => void }) {
  switch (work.status) {
    case "todo": {
      const workflow = workflowOf(work)
      return (
        <>
          <LabelChip icon={<Workflow className={STAT_ICON} aria-hidden />} className="gap-1 pl-1">
            {workflow.name}
          </LabelChip>
          {work.feedback && (
            <span data-feedback-chip className="inline-flex max-w-full min-w-0">
              <LabelChip color="amber">你已反馈</LabelChip>
            </span>
          )}
          {workflow.status === "needs-setup" && <LabelChip color="amber">要配置</LabelChip>}
        </>
      )
    }
    case "doing":
      return (
        <>
          {running ? <Spinner /> : <WorkStatusIcon status="doing" />}
          <span className="truncate text-xs text-fg-2">{progressText(work)}</span>
        </>
      )
    case "waiting":
      return (
        <>
          <Hand className="size-3.5 shrink-0 text-warn" aria-hidden />
          <span className="truncate text-xs text-warn" data-waiting-step>
            {waitingLabel(work)}
          </span>
          <Button
            size="xs"
            variant="outline"
            data-handle
            className="ml-auto"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(work.id)
            }}
          >
            去处理
          </Button>
        </>
      )
    case "done": {
      if (!work.totals) return <span className="text-xs text-fg-2">还没有数据</span>
      // 各平台的数据项不一样，直接写平台自己的叫法：知乎「浏览 1.6万 · 点赞 702」，博客「访问 4,601 · 评论 12」
      return (
        <span className="truncate text-xs text-fg-2" data-card-metrics>
          {cardMetrics(work).map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 && " · "}
              {item.label} <span className="text-fg tabular">{formatCount(item.value)}</span>
            </Fragment>
          ))}
        </span>
      )
    }
  }
}

/**
 * 作品卡片，三层：账号 + 排位或时间；标题；状态相关的一行。
 * 整张卡可点开详情，标题本身是按钮（键盘按 Tab 就能到）。已完成的卡不能拖。
 */
export function WorkCard({
  work,
  queuePos,
  frontId,
  handlers,
}: {
  work: Work
  /** 待实现里的排队位置，其余状态不传 */
  queuePos?: number
  /** 待实现队伍里排第一的作品编号，菜单里「排到最前」要用 */
  frontId: string | null
  handlers: WorkHandlers
}) {
  const account = accountById(work.accountId)
  const running = useWorks((state) => state.running.includes(work.id))
  const source = work.source
  // 取到的是数组里已有的那个对象，引用不变，可以直接用选择器
  const sourceWork = useWorks((state) => (source.kind === "work" ? state.works.find((item) => item.id === source.workId) : undefined))
  const [dragging, setDragging] = useState(false)
  const draggable = work.status !== "done"
  const mark = sourceMarkOf(work, sourceWork)
  const time = cardTimeText(work, queuePos)

  return (
    <div
      data-drag-id={work.id}
      data-work-card={work.id}
      data-status={work.status}
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              startCardDrag(event, WORK_DRAG, work.id)
              setDragging(true)
            }
          : undefined
      }
      onDragEnd={
        draggable
          ? () => {
              endCardDrag()
              setDragging(false)
            }
          : undefined
      }
      onClick={() => handlers.onOpen(work.id)}
      className={cn(
        "group flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow,opacity] duration-(--dur-fast) hover:border-line-3",
        work.status === "waiting" && "border-progress/40 hover:border-progress/70",
        draggable && "active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex h-[18px] min-w-0 items-center gap-2 text-xs text-fg-2">
        <AccountTag account={account} />
        {mark && <span className="truncate text-fg-3">· {mark}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <WorkCardMenu work={work} frontId={frontId} handlers={handlers} />
          {time && (
            <span className="tabular shrink-0" data-queue-pos={work.status === "todo" ? time : undefined}>
              {time}
            </span>
          )}
        </span>
      </div>
      <button
        type="button"
        title={work.title}
        onClick={(event) => {
          event.stopPropagation()
          handlers.onOpen(work.id)
        }}
        className={cn("line-clamp-2 min-w-0 cursor-pointer text-left text-sm text-fg", focusRing)}
      >
        {work.title}
      </button>
      <div className={cn("flex min-w-0 flex-wrap items-center", work.status === "done" ? "gap-x-3 gap-y-1" : "gap-1")}>
        <CardMeta work={work} running={running} onOpen={handlers.onOpen} />
      </div>
    </div>
  )
}
