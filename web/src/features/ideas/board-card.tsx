"use client"

import { IDEA_SOURCE_LABEL, formatRelative, type Idea, type Work } from "@leafpress/core"
import { cn } from "cn"
import { ArrowRight } from "lucide-react"
import { useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { IDEA_DRAG, endCardDrag, startCardDrag } from "@/components/base/board-dnd"
import { WorkChip } from "@/components/base/work-chip"
import { Button } from "@/components/ui/button"
import { useNow } from "@/lib/local-clock"
import { useAccount } from "@/state/data"
import { focusRing } from "@/lib/styles"
import { sourceDetailOf } from "./board-model"
import { HOVER_REVEAL, IdeaMenu } from "./board-menu"

/**
 * 灵感卡片：来源和记下的时间、一句话、细节、账号和转出去的作品。
 * 整张卡点了打开编辑抽屉；没转过的可以拖到别的列，转过的不能拖。
 */
export function IdeaCard({
  idea,
  works,
  onOpen,
  onConvert,
  onDelete,
}: {
  idea: Idea
  /** 转出去的作品里还存在的 */
  works: Work[]
  onOpen(id: string): void
  onConvert(idea: Idea): void
  onDelete(idea: Idea): void
}) {
  const [dragging, setDragging] = useState(false)
  const converted = idea.status === "converted"
  const account = useAccount(idea.accountId)
  const now = useNow()
  const detail = sourceDetailOf(idea)

  return (
    <div
      data-drag-id={idea.id}
      data-idea-card={idea.id}
      draggable={!converted}
      onDragStart={(event) => {
        startCardDrag(event, IDEA_DRAG, idea.id)
        setDragging(true)
      }}
      onDragEnd={() => {
        endCardDrag()
        setDragging(false)
      }}
      onClick={() => onOpen(idea.id)}
      className={cn(
        "group flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left shadow-sm transition-[border-color,box-shadow,opacity] duration-(--dur-fast) hover:border-line-3",
        !converted && "active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex h-[18px] min-w-0 items-center gap-2 text-xs text-fg-2">
        <span className="shrink-0">{IDEA_SOURCE_LABEL[idea.source]}</span>
        {detail && (
          <span className="min-w-0 truncate" title={detail}>
            · {detail}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <IdeaMenu idea={idea} onConvert={onConvert} onDelete={onDelete} />
          <span className="tabular">{now ? formatRelative(idea.createdAt, now) : ""}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onOpen(idea.id)
        }}
        className={cn("line-clamp-3 min-w-0 text-left text-sm wrap-break-word", focusRing)}
      >
        {idea.text}
      </button>
      {idea.detail && <p className="line-clamp-2 text-xs wrap-break-word text-fg-2">{idea.detail}</p>}
      {(account || works.length > 0 || !converted) && (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {account && <AccountTag account={account} />}
          {works.map((work) => (
            <WorkChip key={work.id} work={work} />
          ))}
          {!converted && (
            <Button
              size="xs"
              variant="outline"
              className={cn("ml-auto", HOVER_REVEAL)}
              data-idea-convert
              onClick={(event) => {
                event.stopPropagation()
                onConvert(idea)
              }}
            >
              <ArrowRight />
              转作品
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
