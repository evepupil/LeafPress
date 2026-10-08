"use client"

import { cn } from "cn"
import { Copy, FolderOpen, Hand, Link2, MessageSquare } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Work } from "@/data/types"
import { taskFolder } from "@/data/works"
import { focusRing } from "@/lib/styles"
import { GENERIC_ASK, extractUrl, waitingLabel, workflowOf } from "@/lib/work-engine"
import { useWorks } from "@/state/works"
import { copyWithToast, runAiWithToast } from "./work-sheet-actions"

/**
 * 等你处理面板：全站最重要的东西。
 * 不管哪个工作流、哪一步要你动手，长得都一样：要你做什么、东西放在哪、做完在下面写一句。内容全来自作品上的「要你做的事」。
 */
export function WorkSheetWaiting({ work }: { work: Work }) {
  const submitFeedback = useWorks((state) => state.feedback)
  const [text, setText] = useState("")
  const total = workflowOf(work).steps.length
  const folder = taskFolder(work.id)
  const ready = text.trim().length > 0

  const submit = () => {
    if (!ready) return
    submitFeedback(work.id, text)
    setText("")
    toast.success("已提交，回到 agent 说「继续」就行", { action: { label: "让 AI 继续", onClick: () => runAiWithToast(work.id) } })
  }

  return (
    <section aria-label="要你做的事" data-waiting-panel className="m-4 rounded-lg border border-progress/40 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Hand className="size-4 shrink-0 text-warn" aria-hidden />
        <h3 className="shrink-0 text-sm font-medium">要你做的事</h3>
        <span className="min-w-0 truncate text-sm text-fg-2">{`· ${waitingLabel(work)}`}</span>
        <span className="ml-auto shrink-0 text-xs text-fg-2 tabular">{`第 ${work.step + 1}/${total} 步`}</span>
      </div>

      <p className="mt-2 text-sm break-words whitespace-pre-wrap" data-ask>
        {work.ask ?? GENERIC_ASK}
      </p>

      <div className="mt-2 flex items-center gap-1.5 rounded-md bg-raised px-2 py-1">
        <FolderOpen className="size-3.5 shrink-0 text-fg-3" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={folder}>
          {folder}
        </span>
        <IconButton size="icon-xs" label="复制路径" onClick={() => void copyWithToast(folder, "已复制")}>
          <Copy />
        </IconButton>
      </div>

      <Textarea
        id="work-feedback"
        aria-label="你的反馈"
        rows={3}
        placeholder="做完了写在这里，例如：发布了，链接是 https://…"
        className="mt-3"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // ⌘ / Ctrl + 回车提交；输入法选词时的回车不算
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" data-submit-feedback disabled={!ready} onClick={submit}>
          提交反馈
        </Button>
      </div>
    </section>
  )
}

/** 你已经反馈过、等 AI 继续时，面板换成这一块：你写了什么，里面带链接的话单独列出来 */
export function WorkSheetFeedback({ work }: { work: Work }) {
  const link = extractUrl(work.feedback ?? "")

  return (
    <section data-feedback-panel className="m-4 rounded-lg border border-line bg-raised p-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 shrink-0 text-fg-3" aria-hidden />
        <h3 className="text-sm font-medium">你的反馈</h3>
        <span className="ml-auto shrink-0 text-xs text-fg-2">等 AI 继续</span>
      </div>
      <p className="mt-2 text-sm break-words whitespace-pre-wrap">{work.feedback}</p>
      {link && (
        <p className="mt-2 flex items-center gap-1.5">
          <Link2 className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className={cn("min-w-0 truncate rounded-sm text-xs text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg", focusRing)}
          >
            {link}
          </a>
        </p>
      )}
    </section>
  )
}
