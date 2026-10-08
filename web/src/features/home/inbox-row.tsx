import { ExternalLink } from "lucide-react"
import Link from "next/link"

import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { formatDayRelative, formatRelative } from "@/lib/format"
import type { InboxItem, InboxTone } from "@/lib/metrics"

/** 状态图形给读屏用的文字，和上面筛选里的名字一致 */
const TONE_LABEL: Record<InboxTone, string> = {
  risk: "要紧",
  progress: "进行中",
  idle: "稍后",
}

/**
 * 状态图形只负责一眼认出轻重：要紧是感叹号，稍后是空心圈；
 * 进行中分两种，排期的事「日子已定、还没开始」用圆点，其余等你处理的用半圈。
 */
function InboxGlyph({ item }: { item: InboxItem }) {
  const label = TONE_LABEL[item.tone]
  if (item.tone === "risk") return <StatusIcon glyph="alert" tone="risk" label={label} />
  if (item.tone === "progress") {
    return <StatusIcon glyph={item.kind === "planned" ? "dot" : "half"} tone="progress" label={label} />
  }
  return <StatusIcon glyph="ring" tone="idle" label={label} />
}

/** 排期的事显示「还有几天发」，其余显示「多久之前」 */
function timeText(item: InboxItem): string {
  return item.kind === "planned" ? formatDayRelative(item.at.slice(0, 10)) : formatRelative(item.at)
}

/**
 * 待处理清单的一行：状态图形、两行文字、时间、动作按钮。
 * 标题和说明过长时各自截成一行，完整文字放在整行的 title 里，鼠标停上去能看全。
 * 动作按钮站内走 Link，站外（审核页）开新窗口并带外链图标。
 */
export function InboxRow({ item }: { item: InboxItem }) {
  return (
    <li
      data-inbox-item={item.id}
      data-tone={item.tone}
      title={`${item.title}\n${item.detail}`}
      className="flex min-h-12 items-center gap-3 px-3 py-2"
    >
      <InboxGlyph item={item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{item.title}</p>
        <p className="truncate text-xs text-fg-2">{item.detail}</p>
      </div>
      <span className="hidden shrink-0 text-xs text-fg-2 tabular sm:block">{timeText(item)}</span>
      <Button variant="outline" size="sm" asChild className="shrink-0">
        {item.external ? (
          <a href={item.href} target="_blank" rel="noreferrer" data-inbox-action>
            {item.action}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <Link href={item.href} data-inbox-action>
            {item.action}
          </Link>
        )}
      </Button>
    </li>
  )
}
