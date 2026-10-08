"use client"

import { cn } from "cn"
import {
  Bot,
  ChevronRight,
  Clapperboard,
  Clock,
  CloudDownload,
  Copy,
  Images,
  LayoutGrid,
  MessageSquare,
  Newspaper,
  NotebookPen,
  PenLine,
  ScrollText,
  Send,
  Terminal,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { PlatformMark } from "@/components/base/marks"
import { RunStateIcon, ToolStatusIcon } from "@/components/base/state-icons"
import { TOOL_STATUS_LABEL } from "@/data/labels"
import type { Tool, ToolIcon } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { toolStats } from "@/lib/metrics"
import { copyText } from "@/lib/platform"
import { focusRing } from "@/lib/styles"

/** 数据里存的是图标名，这里对应到真正的图标 */
const TOOL_ICON: Record<ToolIcon, LucideIcon> = {
  send: Send,
  message: MessageSquare,
  pen: PenLine,
  notebook: NotebookPen,
  images: Images,
  newspaper: Newspaper,
  video: Clapperboard,
  cards: LayoutGrid,
  download: CloudDownload,
  report: ScrollText,
}

/** 复制一段文字：成功提示「已复制」，浏览器不让写剪贴板时也要让人知道 */
async function copy(text: string) {
  if (await copyText(text)) toast.success("已复制")
  else toast.error("复制失败")
}

/**
 * 一个工具一张卡。工具只在 Claude Code 里发起，所以最显眼的是「怎么说」，
 * 其次是步骤和最近一次的运行结果。
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = TOOL_ICON[tool.icon]
  const { runsThisMonth, lastRun } = toolStats(tool.id)
  const { command } = tool

  return (
    <article
      data-tool-card={tool.id}
      data-status={tool.status}
      className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-column text-fg-2">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="min-w-0 truncate text-sm font-medium">{tool.name}</h3>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-fg-2">
          <ToolStatusIcon status={tool.status} />
          {TOOL_STATUS_LABEL[tool.status]}
        </span>
      </div>

      <p className="line-clamp-2 text-sm text-fg-2">{tool.summary}</p>

      <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-2" aria-label="步骤">
        {tool.steps.map((step, index) => (
          <li key={step} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-3 text-fg-3" aria-hidden />}
            <span className="rounded-[4px] bg-column px-1.5 py-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
        {tool.platforms.map((platform) => (
          <PlatformMark key={platform} platform={platform} size={14} />
        ))}
        <span className="truncate">产出：{tool.outputs}</span>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-md bg-raised px-2 py-1.5">
        <Bot className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs" title={tool.say} data-tool-say>
          「{tool.say}」
        </span>
        <IconButton label="复制说法" size="icon-xs" data-tool-copy onClick={() => copy(tool.say)}>
          <Copy />
        </IconButton>
      </div>

      {command && (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-raised px-2 py-1.5">
          <Terminal className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2" title={command}>
            {command}
          </span>
          <IconButton label="复制命令" size="icon-xs" onClick={() => copy(command)}>
            <Copy />
          </IconButton>
        </div>
      )}

      {tool.status === "needs-setup" && tool.setupHint && (
        <p className="flex items-start gap-1.5 text-xs text-warn">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {tool.setupHint}
        </p>
      )}

      {/* 底行用 mt-auto 贴在卡片底部，同一行的卡片等高时底行也对齐 */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-fg-2">
        <span className="tabular" data-tool-runs>
          本月 {runsThisMonth} 次
        </span>
        {lastRun ? (
          <Link href={`/tools/?run=${lastRun.id}`} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-fg", focusRing)}>
            <RunStateIcon state={lastRun.state} size={12} />
            <span className="tabular">{formatRelative(lastRun.startedAt)}</span>
          </Link>
        ) : (
          <span>还没跑过</span>
        )}
        {tool.schedule && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {tool.schedule}
          </span>
        )}
      </div>
    </article>
  )
}
