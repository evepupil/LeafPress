"use client"

import { cn } from "cn"
import { ArrowRight, Ellipsis, Inbox, Star, Trash2 } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Idea } from "@/data/types"
import { useIdeas } from "@/state/ideas"

/** 悬停到卡片上才出现；键盘焦点落在卡片里、手机和平板上一直显示（规则同作品卡片） */
export const HOVER_REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-100"

/** 灵感卡片的「更多」菜单：转作品、在收件箱和值得写之间挪、删除。手机不能拖动，靠这里挪列 */
export function IdeaMenu({ idea, onConvert, onDelete }: { idea: Idea; onConvert(idea: Idea): void; onDelete(idea: Idea): void }) {
  const moveTo = (status: "inbox" | "promising") => useIdeas.getState().drop(idea.id, status, null)

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
      {/* 菜单画在卡片外面，但点击仍会沿着组件树冒到卡片上把抽屉打开，所以在这里拦住 */}
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => onConvert(idea)}>
          <ArrowRight />
          转作品
        </DropdownMenuItem>
        {idea.status === "inbox" && (
          <DropdownMenuItem onSelect={() => moveTo("promising")}>
            <Star />
            挪到值得写
          </DropdownMenuItem>
        )}
        {idea.status === "promising" && (
          <DropdownMenuItem onSelect={() => moveTo("inbox")}>
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
