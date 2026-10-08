"use client"

import { cn } from "cn"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { IconButton } from "@/components/base/icon-button"
import { StatusIcon, type GlyphTone, type StatusGlyph } from "@/components/base/status-icon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatRelative } from "@/lib/format"
import { INBOX, type InboxItem, type InboxTone } from "@/lib/metrics"
import { focusRingInset } from "@/lib/styles"

/** 提醒 = 待处理里除了「闲置」级别以外的那些：出错的、等我处理的、快到日子的 */
const ALERTS = INBOX.filter((item) => item.tone !== "idle")
const HAS_RISK = ALERTS.some((item) => item.tone === "risk")

const TONE_LOOK: Record<InboxTone, { glyph: StatusGlyph; tone: GlyphTone }> = {
  risk: { glyph: "alert", tone: "risk" },
  progress: { glyph: "half", tone: "progress" },
  idle: { glyph: "ring", tone: "idle" },
}

const rowClass = cn("flex items-start gap-2 px-3 py-2 transition-colors duration-(--dur-fast) hover:bg-hover", focusRingInset)

/** 一条提醒，整行是链接；审核页这类站外地址用新窗口打开 */
function AlertRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const look = TONE_LOOK[item.tone]
  const body = (
    <>
      <StatusIcon glyph={look.glyph} tone={look.tone} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{item.title}</span>
        <span className="block truncate text-xs text-fg-2">{item.detail}</span>
      </span>
      {/* 排期类写的是「哪天发」，标题里已经有了，不再配时间 */}
      {item.kind !== "planned" && <span className="shrink-0 text-xs text-fg-2 tabular">{formatRelative(item.at)}</span>}
    </>
  )
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" data-notification={item.id} onClick={onOpen} className={rowClass}>
        {body}
      </a>
    )
  }
  return (
    <Link href={item.href} data-notification={item.id} onClick={onOpen} className={rowClass}>
      {body}
    </Link>
  )
}

/** 窗口栏的铃铛：点开是需要处理的事，点一条直接去处理；有出错的事时右上角亮红点 */
export function Notifications() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton label="提醒" className="relative" data-notifications>
          <Bell />
          {HAS_RISK && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-risk ring-2 ring-window" />}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="提醒" className="w-80 gap-0 overflow-hidden p-0">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-sm font-medium">提醒</span>
          <span className="text-xs text-fg-2 tabular">{ALERTS.length}</span>
        </div>
        {ALERTS.length === 0 ? (
          <EmptyState icon={Bell} title="没有需要处理的事" />
        ) : (
          <ul className="scroll-thin max-h-[min(420px,60vh)] overflow-y-auto">
            {ALERTS.map((item) => (
              <li key={item.id}>
                <AlertRow item={item} onOpen={close} />
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/#inbox"
          onClick={close}
          className={cn(
            "flex h-9 shrink-0 items-center justify-center border-t border-line text-sm text-fg-2 transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg",
            focusRingInset,
          )}
        >
          全部待处理
        </Link>
      </PopoverContent>
    </Popover>
  )
}
