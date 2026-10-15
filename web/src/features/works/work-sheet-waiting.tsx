"use client"

import { type Work, type WorkDetail, extractUrl, waitingLabel, workflowById } from "@leafpress/core"
import { cn } from "cn"
import { Copy, ExternalLink, FolderOpen, Hand, Link2, MessageSquare } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { openFolder, submitFeedback } from "@/state/actions/works"
import { focusRing } from "@/lib/styles"
import { copyWithToast } from "./work-sheet-actions"
import { publishPageUrlOf } from "./work-sheet-waiting-publish"

export function WorkSheetWaiting({ work, detail }: { work: Work; detail?: WorkDetail }) {
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const workflow = workflowById(work.workflowId)
  const stepName = workflow?.steps[work.step]?.name
  const folder = detail?.folder
  const publishPage = publishPageUrlOf(work.id, detail)
  const ready = text.trim().length > 0
  const submit = async () => {
    if (!ready || saving) return
    setSaving(true)
    try {
      await submitFeedback(work.id, text)
      setText("")
      toast.success("反馈已提交")
    } catch (error) {
      toast(error instanceof Error ? error.message : "提交反馈失败")
    } finally {
      setSaving(false)
    }
  }
  return (
    <section aria-label="要你做的事" data-waiting-panel className="m-4 rounded-lg border border-progress/40 bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Hand className="size-4 shrink-0 text-warn" aria-hidden />
        <h3 className="shrink-0 text-sm font-medium">要你做的事</h3>
        <span className="min-w-0 truncate text-sm text-fg-2">{`· ${workflow ? waitingLabel(work, workflow) : "等你处理"}`}</span>
        {workflow && (
          <span className="ml-auto shrink-0 text-xs text-fg-2 tabular">{`第 ${work.step + 1}/${workflow.steps.length} 步`}</span>
        )}
      </div>
      <p className="mt-2 text-sm break-words whitespace-pre-wrap" data-ask>
        {work.ask ?? stepName ?? "请完成当前步骤后提交反馈。"}
      </p>
      {folder && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md bg-raised px-2 py-1">
          <FolderOpen className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={folder}>
            {folder}
          </span>
          <IconButton size="icon-xs" label="复制路径" onClick={() => void copyWithToast(folder, "已复制")}>
            <Copy />
          </IconButton>
          <IconButton
            size="icon-xs"
            label="打开任务文件夹"
            onClick={() =>
              void openFolder(work.id)
                .then(() => toast.success("已在资源管理器里打开"))
                .catch((error: unknown) => toast(error instanceof Error ? error.message : "打开文件夹失败"))
            }
          >
            <FolderOpen />
          </IconButton>
        </div>
      )}
      {publishPage && (
        <div className="mt-2">
          <Button variant="outline" size="sm" asChild data-publish-page>
            <a href={publishPage} target="_blank" rel="noreferrer">
              <ExternalLink />
              打开发布稿
            </a>
          </Button>
        </div>
      )}
      <Textarea
        id="work-feedback"
        aria-label="你的反馈"
        rows={3}
        placeholder="做完了写在这里，例如：发布了，链接是 https://…"
        className="mt-3"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" data-submit-feedback disabled={!ready || saving} onClick={() => void submit()}>
          {saving ? "正在提交…" : "提交反馈"}
        </Button>
      </div>
    </section>
  )
}

export function WorkSheetFeedback({ work }: { work: Work }) {
  const link = extractUrl(work.feedback ?? "")
  return (
    <section data-feedback-panel className="m-4 rounded-lg border border-line bg-raised p-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 shrink-0 text-fg-3" aria-hidden />
        <h3 className="text-sm font-medium">你的反馈</h3>
        <span className="ml-auto shrink-0 text-xs text-fg-2">等 agent 继续</span>
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
