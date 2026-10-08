"use client"

import { type Work, type WorkStatus } from "@leafpress/core"
import { ChevronUp, CircleCheck, Ellipsis, ExternalLink, Hand, Repeat, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { moveWork } from "@/state/actions/works"
import type { WorkHandlers } from "./works-model"

export function WorkCardMenu({ work, frontId, handlers }: { work: Work; frontId: string | null; handlers: WorkHandlers }) {
  const move = (status: Exclude<WorkStatus, "doing">, beforeId: string | null = null) => {
    void moveWork(work.id, status, beforeId).catch((error: unknown) => toast(error instanceof Error ? error.message : "移动作品失败"))
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
