"use client"

import { Copy, MessageSquare } from "lucide-react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { copyText } from "@/lib/platform"

/** 卡片底行：在 agent 里怎么说才会用到这个工作流，一键复制 */
export function WorkflowSay({ say }: { say: string }) {
  const text = `在 agent 里说「${say}」`

  async function copy() {
    if (await copyText(say)) toast.success("已复制")
    else toast("浏览器不让写剪贴板，请手动选中复制")
  }

  return (
    <footer className="mt-auto flex items-center gap-2 border-t border-line px-3 py-2">
      <MessageSquare className="size-3.5 shrink-0 text-fg-3" aria-hidden />
      <span title={text} className="min-w-0 flex-1 truncate text-xs text-fg-2">
        {text}
      </span>
      <IconButton size="icon-xs" label="复制说法" onClick={() => void copy()}>
        <Copy />
      </IconButton>
    </footer>
  )
}
