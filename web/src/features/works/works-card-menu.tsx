"use client"

import { Bot, ChevronUp, CircleCheck, Ellipsis, ExternalLink, Hand, Repeat, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Work, WorkStatus } from "@/data/types"
import { useWorks } from "@/state/works"
import type { WorkHandlers } from "./works-model"

/**
 * 卡片右上角的「更多」菜单：手机上拖不动卡片，挪列、让 AI 做都靠它；桌面上也是拖动之外的另一条路。
 * 菜单画在浮层里，但点击会沿组件树冒泡到卡片上（卡片整张可点），所以菜单内容和触发器都要拦住。
 */
export function WorkCardMenu({
  work,
  frontId,
  handlers,
}: {
  work: Work
  /** 待实现队伍里排第一的作品编号（不受筛选影响）；本身就是第一时「排到最前」点不了 */
  frontId: string | null
  handlers: WorkHandlers
}) {
  const runAi = useWorks((state) => state.runAi)
  const drop = useWorks((state) => state.drop)

  const startAi = () => {
    const result = runAi(work.id)
    if (!result.ok) toast(result.reason)
  }

  const move = (status: WorkStatus, beforeId: string | null = null) => {
    const result = drop(work.id, status, beforeId)
    if (!result.ok) toast(result.reason)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label="更多"
          size="icon-xs"
          data-card-menu
          onClick={(event) => event.stopPropagation()}
          className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100 max-lg:opacity-100"
        >
          <Ellipsis />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(event) => event.stopPropagation()}>
        {work.status === "todo" && (
          <>
            <DropdownMenuItem onSelect={startAi}>
              <Bot />让 AI 做
            </DropdownMenuItem>
            <DropdownMenuItem disabled={frontId === null || work.id === frontId} onSelect={() => move("todo", frontId)}>
              <ChevronUp />
              排到最前
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("waiting")}>
              <Hand />
              挪到等你处理
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("done")}>
              <CircleCheck />
              标记完成
            </DropdownMenuItem>
          </>
        )}
        {work.status === "doing" && (
          <>
            <DropdownMenuItem onSelect={() => move("todo")}>
              <RotateCcw />
              挪回待实现
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("waiting")}>
              <Hand />
              挪到等你处理
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("done")}>
              <CircleCheck />
              标记完成
            </DropdownMenuItem>
          </>
        )}
        {work.status === "waiting" && (
          <>
            <DropdownMenuItem onSelect={() => handlers.onOpen(work.id)}>
              <Hand />
              去处理
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("todo")}>
              <RotateCcw />
              挪回待实现
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => move("done")}>
              <CircleCheck />
              标记完成
            </DropdownMenuItem>
          </>
        )}
        {work.status === "done" && (
          <>
            <DropdownMenuItem onSelect={() => handlers.onConvert(work)}>
              <Repeat />
              转作品
            </DropdownMenuItem>
            {work.url && (
              <DropdownMenuItem asChild>
                <a href={work.url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  打开链接
                </a>
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => handlers.onDelete(work)}>
          <Trash2 />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
