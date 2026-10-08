"use client"

import { cn } from "cn"
import { Ellipsis } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { IconButton } from "@/components/base/icon-button"
import { LabelChip } from "@/components/base/label-chip"
import { ColorDot } from "@/components/base/marks"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { accountById, columnOf } from "@/data/accounts"
import { IDEA_SOURCE_LABEL, IDEA_STATUS_LABEL } from "@/data/labels"
import type { Idea, IdeaStatus } from "@/data/types"
import { WORKS } from "@/data/works"
import { formatRelative } from "@/lib/format"
import { shortTitle } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { useIdeas } from "@/state/ideas"
import { IdeaSourceIcon, IdeaStatusIcon } from "./board-icons"

/** 菜单里能把灵感挪去的地方，顺序固定；灵感现在所在的那一项不出现 */
const MOVE_ITEMS: { status: IdeaStatus; label: string }[] = [
  { status: "inbox", label: "移到收件箱" },
  { status: "promising", label: "移到值得写" },
  { status: "scheduled", label: "移到已排期" },
  { status: "shelved", label: "搁置" },
]

/** 看板上的一张灵感卡：文字、来源、账号和栏目、记下的时间，右上角是操作菜单 */
export function IdeaCard({ idea }: { idea: Idea }) {
  const move = useIdeas((state) => state.move)
  const convert = useIdeas((state) => state.convert)

  const account = idea.accountId ? accountById(idea.accountId) : undefined
  const column = idea.accountId && idea.columnId ? columnOf(idea.accountId, idea.columnId) : undefined
  // 新转出来的作品还没进作品表，找不到时只显示文字、不给链接
  const work = idea.workId ? WORKS.find((item) => item.id === idea.workId) : undefined

  // 已转成作品的灵感只能搁置，不能再挪回前面的列
  const isConverted = idea.status === "converted"
  const moveItems = isConverted
    ? MOVE_ITEMS.filter((item) => item.status === "shelved")
    : MOVE_ITEMS.filter((item) => item.status !== idea.status)

  function moveTo(status: IdeaStatus) {
    move(idea.id, status)
    toast.success(`已移到「${IDEA_STATUS_LABEL[status]}」`)
  }

  function convertToWork() {
    convert(idea.id)
    toast.success("已转成作品")
  }

  return (
    <div
      data-idea-card={idea.id}
      data-status={idea.status}
      className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm line-clamp-3 break-words">{idea.text}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="操作" size="icon-xs" data-idea-menu>
              <Ellipsis />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moveItems.map((item) => (
              <DropdownMenuItem key={item.status} onSelect={() => moveTo(item.status)}>
                <IdeaStatusIcon status={item.status} />
                {item.label}
              </DropdownMenuItem>
            ))}
            {!isConverted && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem data-idea-convert onSelect={convertToWork}>
                  <IdeaStatusIcon status="converted" />
                  转成作品
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs text-fg-2">
        <LabelChip icon={<IdeaSourceIcon source={idea.source} className="size-3 text-fg-3" />} title={idea.sourceDetail}>
          {IDEA_SOURCE_LABEL[idea.source]}
        </LabelChip>
        {account && <AccountTag account={account} />}
        {column && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <ColorDot color={column.color} />
            <span className="truncate">{column.name}</span>
          </span>
        )}
        <span className="ml-auto shrink-0 tabular">{formatRelative(idea.createdAt)}</span>
      </div>

      {isConverted &&
        (work ? (
          <Link
            href={`/works/?open=${work.id}`}
            className={cn("max-w-full self-start truncate text-xs text-fg-2 hover:text-fg", focusRing)}
          >
            → {shortTitle(work.title)}
          </Link>
        ) : (
          <span className="truncate text-xs text-fg-2">→ 新作品</span>
        ))}
    </div>
  )
}
