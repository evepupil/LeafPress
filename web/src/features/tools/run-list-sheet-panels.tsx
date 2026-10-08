"use client"

import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WECHAT_REVIEW_URL } from "@/data/tools"
import type { ToolRun } from "@/data/types"

/** 知乎写作的大纲预览（演示内容，真实运行时由 Claude Code 给出） */
const OUTLINE_PREVIEW = ["一稿多发为什么难", "先登记发布意图，再调平台", "AI 改写和固定转换分开", "发布前作者确认", "数据回来以后怎么用"]

interface WaitingProps {
  run: ToolRun
  backfill: string
  onBackfillChange(value: string): void
  onBackfill(): void
  onConfirm(): void
}

/** 等你处理的提示：不同工具要你做的事不一样，动作按钮也不一样 */
function WaitingAction({ run, backfill, onBackfillChange, onBackfill, onConfirm }: WaitingProps) {
  switch (run.toolId) {
    case "blog-to-zhihu":
      return (
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            onBackfill()
          }}
        >
          <Input
            data-run-backfill
            aria-label="粘贴链接"
            placeholder="粘贴知乎文章链接"
            className="h-7"
            value={backfill}
            onChange={(event) => onBackfillChange(event.target.value)}
          />
          <Button type="submit" size="sm" data-run-backfill-submit disabled={!backfill.trim()}>
            登记
          </Button>
        </form>
      )
    case "video-pipeline":
      return (
        <Button size="sm" className="mt-2" data-run-confirm onClick={onConfirm}>
          字幕校对完了
        </Button>
      )
    case "zhihu-writing":
      return (
        <>
          <ol className="mt-2 list-decimal pl-5 text-sm">
            {OUTLINE_PREVIEW.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ol>
          <Button size="sm" className="mt-2" data-run-confirm onClick={onConfirm}>
            确认大纲
          </Button>
        </>
      )
    case "wechat-review":
      return (
        <Button variant="outline" size="sm" className="mt-2" asChild>
          <a href={WECHAT_REVIEW_URL} target="_blank" rel="noreferrer">
            打开审核页
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </Button>
      )
    default:
      return null
  }
}

export function WaitingPanel(props: WaitingProps) {
  return (
    <div className="mx-4 mt-3 rounded-md bg-raised px-3 py-2.5" data-run-waiting>
      <p className="text-sm">等你：{props.run.waitingFor}</p>
      <WaitingAction {...props} />
    </div>
  )
}

/** 失败的提示：写明原因，给一个重试 */
export function FailedPanel({ run, onRetry }: { run: ToolRun; onRetry(): void }) {
  return (
    <div className="mx-4 mt-3 rounded-md bg-raised px-3 py-2.5" data-run-failed>
      <p className="text-sm break-words text-bad">{run.error}</p>
      <Button variant="outline" size="sm" className="mt-2" data-run-retry onClick={onRetry}>
        重试
      </Button>
    </div>
  )
}
