"use client"

import { cn } from "cn"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { IconButton } from "@/components/base/icon-button"
import { StatusIcon, type GlyphTone, type StatusGlyph } from "@/components/base/status-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { type Notice, type NoticeTone, notices } from "@/lib/board"
import { formatRelative } from "@/lib/format"
import { focusRingInset } from "@/lib/styles"
import { useWorks } from "@/state/works"

const TONE_LOOK: Record<NoticeTone, { glyph: StatusGlyph; tone: GlyphTone }> = {
  risk: { glyph: "alert", tone: "risk" },
  progress: { glyph: "dot", tone: "progress" },
  idle: { glyph: "ring", tone: "idle" },
}

const rowClass = cn("flex items-start gap-2 px-3 py-2 transition-colors duration-(--dur-fast) hover:bg-hover", focusRingInset)

function NoticeRow({ item, onOpen }: { item: Notice; onOpen: () => void }) {
  const look = TONE_LOOK[item.tone]
  return (
    <Link href={item.href} data-notification={item.id} onClick={onOpen} className={rowClass}>
      <StatusIcon glyph={look.glyph} tone={look.tone} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{item.title}</span>
        <span className="block truncate text-xs text-fg-2">{item.detail}</span>
      </span>
      <span className="shrink-0 text-xs text-fg-2 tabular">{formatRelative(item.at)}</span>
    </Link>
  )
}

/** 窗口栏的铃铛：数据拉取失败、等你处理的作品、该手填的数据；有出错的事时右上角亮红点 */
export function Notifications() {
  const [open, setOpen] = useState(false)
  const works = useWorks((state) => state.works)
  const items = useMemo(() => notices(works), [works])
  const hasRisk = items.some((item) => item.tone === "risk")
  const close = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="提醒" className="relative" data-notifications>
          <Bell />
          {hasRisk && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-risk ring-2 ring-window" />}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="提醒" className="w-80 gap-0 overflow-hidden p-0">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-sm font-medium">提醒</span>
          <span className="text-xs text-fg-2 tabular">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={Bell} title="没有需要处理的事" />
        ) : (
          <ul className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <NoticeRow item={item} onOpen={close} />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
