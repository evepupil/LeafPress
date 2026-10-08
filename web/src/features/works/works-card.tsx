"use client"

import { formatCount, isUsable, progressText, waitingLabel, workflowById, type Account, type Work } from "@leafpress/core"
import { cn } from "cn"
import { Hand, Workflow } from "lucide-react"
import { Fragment, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { WORK_DRAG, endCardDrag, startCardDrag } from "@/components/base/board-dnd"
import { LabelChip } from "@/components/base/label-chip"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { AgentLeaseStatus } from "./agent-lease"
import { useAccounts, useWorks } from "@/state/data"
import { useNow } from "@/lib/local-clock"
import { focusRing } from "@/lib/styles"
import { WorkCardMenu } from "./works-card-menu"
import { cardMetrics, cardTimeText, sourceMarkOf, type WorkHandlers } from "./works-model"

const STAT_ICON = "size-3.5 shrink-0 text-fg-3"

function CardMeta({ work, account, now, onOpen }: { work: Work; account: Account; now?: string; onOpen: (id: string) => void }) {
  const workflow = workflowById(work.workflowId)
  switch (work.status) {
    case "todo":
      return (
        <>
          {workflow && (
            <LabelChip icon={<Workflow className={STAT_ICON} aria-hidden />} className="gap-1 pl-1">
              {workflow.name}
            </LabelChip>
          )}
          {work.feedback && (
            <span data-feedback-chip className="inline-flex max-w-full min-w-0">
              <LabelChip color="amber">你已反馈</LabelChip>
            </span>
          )}
          {workflow && !isUsable(workflow, account.settings) && <LabelChip color="amber">要配置</LabelChip>}
        </>
      )
    case "doing":
      return (
        <>
          <WorkStatusIcon status="doing" />
          <span className="truncate text-xs text-fg-2">{workflow ? progressText(work, workflow) : "进行中"}</span>
          <AgentLeaseStatus work={work} now={now} />
          {work.error && <LabelChip color="red">出错了</LabelChip>}
        </>
      )
    case "waiting":
      return (
        <>
          <Hand className="size-3.5 shrink-0 text-warn" aria-hidden />
          <span className="truncate text-xs text-warn" data-waiting-step>
            {workflow ? waitingLabel(work, workflow) : "等你处理"}
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
      return (
        <span className="truncate text-xs text-fg-2" data-card-metrics>
          {cardMetrics(work, account.platform).map((item, index) => (
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

export function WorkCard({
  work,
  queuePos,
  frontId,
  handlers,
}: {
  work: Work
  queuePos?: number
  frontId: string | null
  handlers: WorkHandlers
}) {
  const accounts = useAccounts()
  const works = useWorks()
  const account = accounts.find((item) => item.id === work.accountId)
  const sourceWorkId = work.source.kind === "work" ? work.source.workId : undefined
  const sourceWork = sourceWorkId ? works.find((item) => item.id === sourceWorkId) : undefined
  const now = useNow()
  const [dragging, setDragging] = useState(false)
  const draggable = work.status !== "done"
  const mark = sourceMarkOf(work, sourceWork, accounts)
  const time = cardTimeText(work, queuePos, now ?? work.updatedAt)
  if (!account) return null
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
        <CardMeta work={work} account={account} now={now} onOpen={handlers.onOpen} />
      </div>
    </div>
  )
}
