"use client"

import { cn } from "cn"
import { ArrowRight, Inbox, Star } from "lucide-react"
import { Fragment, useMemo, useState, type ReactNode } from "react"

import { BoardColumn } from "@/components/base/board"
import { DropLine, IDEA_DRAG, useBoardDrop } from "@/components/base/board-dnd"
import { IDEA_STATUS_LABEL, sortIdeas, type Idea, type IdeaStatus, type Work } from "@leafpress/core"
import { focusRing } from "@/lib/styles"
import { IdeaCard } from "./board-card"
import { worksOf } from "./board-model"

const COLUMN_ICON: Record<IdeaStatus, ReactNode> = {
  inbox: <Inbox className="size-4 text-fg-2" aria-hidden />,
  promising: <Star className="size-4 text-fg-2" aria-hidden />,
  converted: <ArrowRight className="size-4 text-fg-2" aria-hidden />,
}

/** 已转作品一列会越攒越多，默认只摆前面几张，点按钮再多摆几张 */
const CONVERTED_PAGE = 8

/**
 * 看板上的一列。卡片可以拖进来：收件箱和值得写按落点排先后；
 * 拖进「已转作品」不改状态，打开转作品弹窗。
 */
export function IdeaColumn({
  status,
  ideas,
  worksById,
  onOpen,
  onConvert,
  onDelete,
  onMove,
}: {
  status: IdeaStatus
  /** 全部灵感，这一列自己挑出属于自己的 */
  ideas: Idea[]
  worksById: ReadonlyMap<string, Work>
  onOpen(id: string): void
  onConvert(idea: Idea): void
  onDelete(idea: Idea): void
  onMove(id: string, status: Exclude<IdeaStatus, "converted">, beforeId: string | null): void
}) {
  const items = useMemo(() => sortIdeas(ideas, status), [ideas, status])
  const [limit, setLimit] = useState(CONVERTED_PAGE)
  const { over, beforeId, dropProps } = useBoardDrop(IDEA_DRAG, (id, before) => {
    if (status === "converted") {
      const idea = ideas.find((item) => item.id === id)
      if (idea) onConvert(idea)
      return
    }
    onMove(id, status, before)
  })

  const shown = status === "converted" ? items.slice(0, limit) : items
  const hidden = items.length - shown.length
  // 已转作品一列不排先后，只加虚线框
  const showLine = over && status !== "converted"

  return (
    <div {...dropProps} data-idea-column={status} className="min-w-0">
      <BoardColumn
        icon={COLUMN_ICON[status]}
        title={IDEA_STATUS_LABEL[status]}
        count={items.length}
        className={cn("w-full transition-[outline-color]", over && "outline-2 outline-offset-[-2px] outline-dashed outline-line-3")}
      >
        {items.length === 0 && <p className="px-2 pb-2 text-sm text-fg-2">这一列是空的</p>}
        {shown.map((idea) => (
          <Fragment key={idea.id}>
            {showLine && beforeId === idea.id && <DropLine />}
            <IdeaCard idea={idea} works={worksOf(idea, worksById)} onOpen={onOpen} onConvert={onConvert} onDelete={onDelete} />
          </Fragment>
        ))}
        {showLine && beforeId === null && <DropLine />}
        {hidden > 0 && (
          <button
            type="button"
            data-show-more
            onClick={() => setLimit((current) => current + CONVERTED_PAGE)}
            className={cn("h-8 shrink-0 rounded-md text-sm text-fg-2 hover:bg-hover hover:text-fg", focusRing)}
          >
            再显示 {CONVERTED_PAGE} 个
          </button>
        )}
      </BoardColumn>
    </div>
  )
}
