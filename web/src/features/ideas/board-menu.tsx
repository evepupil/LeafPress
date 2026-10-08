"use client"

import { IDEA_STATUS_LABEL, type Idea } from "@leafpress/core"
import { cn } from "cn"
import { ArrowRight, Ellipsis, Inbox, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { moveIdea } from "@/state/actions/ideas"

export const HOVER_REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-100"

export function IdeaMenu({ idea, onConvert, onDelete }: { idea: Idea; onConvert(idea: Idea): void; onDelete(idea: Idea): void }) {
  const moveTo = async (status: "inbox" | "promising") => {
    try {
      await moveIdea(idea.id, status, null)
    } catch (error) {
      toast(error instanceof Error ? error.message : `移动到${IDEA_STATUS_LABEL[status]}失败`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          label="更多"
          size="icon-xs"
          data-card-menu
          className={cn(HOVER_REVEAL, "data-[state=open]:opacity-100")}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onConvert(idea)}>
          <ArrowRight />
          转作品
        </DropdownMenuItem>
        {idea.status === "inbox" && (
          <DropdownMenuItem onSelect={() => void moveTo("promising")}>
            <Star />
            挪到值得写
          </DropdownMenuItem>
        )}
        {idea.status === "promising" && (
          <DropdownMenuItem onSelect={() => void moveTo("inbox")}>
            <Inbox />
            挪回收件箱
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(idea)}>
          <Trash2 />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
