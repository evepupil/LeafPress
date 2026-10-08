"use client"

import { cn } from "cn"
import { Bot, Copy, Keyboard } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { copyText } from "@/lib/platform"
import { focusRing } from "@/lib/styles"
import { exportBackup } from "@/state/actions/system"
import { useData } from "@/state/data"
import { useUi } from "@/state/ui"

const PHRASES = ["看看 LeafPress 有哪些待实现的作品，挑第一个做", "继续", "把这几条记成灵感：…"]

async function copy(text: string) {
  if (await copyText(text)) toast.success("已复制")
  else toast("浏览器不让写剪贴板，请手动选中复制")
}

function CopyRow({ text, label, mono = false }: { text: string; label: string; mono?: boolean }) {
  return (
    <li className="flex min-h-9 items-center gap-2 rounded-md border border-line bg-card pr-1 pl-2.5">
      <span className={cn("min-w-0 flex-1 truncate text-sm", mono && "font-mono text-xs")} title={text}>
        {text}
      </span>
      <IconButton label={label} size="icon-sm" onClick={() => void copy(text)}>
        <Copy />
      </IconButton>
    </li>
  )
}

/** 右上角的头像菜单：交给 AI、导出备份、快捷键 */
export function UserMenu() {
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)
  const paths = useData((state) => state.boot?.paths)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [agentOpen, setAgentOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          aria-label="我的"
          data-user-menu
          className={cn(
            "ml-1 flex size-6 items-center justify-center rounded-full border border-line-2 bg-column text-xs font-medium transition-colors duration-(--dur-fast) hover:border-line-3",
            focusRing,
          )}
        >
          叶
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setAgentOpen(true)}>
            <Bot />
            交给 AI
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard />
            快捷键
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void exportBackup()
                .then((result) => toast.success(`已导出到 ${result.dir}`))
                .catch((error: unknown) => toast(error instanceof Error ? error.message : "导出失败"))
            }}
          >
            <Copy />
            导出备份
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogContent
          className="gap-0 p-0 sm:max-w-[480px]"
          // 弹窗是从头像菜单里点开的，关掉后焦点回到头像
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <DialogHeader className="border-b border-line px-4 py-3">
            <DialogTitle>交给 AI</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-4 py-4">
            <DialogDescription>每个作品的要求、进度、要你做的事和你的反馈都在任务文件夹里，能读文件的 agent 都能接着做。</DialogDescription>
            <ul className="flex flex-col gap-1.5">
              {paths?.tasks ? (
                <CopyRow text={paths.tasks} label="复制任务文件夹" mono />
              ) : (
                <li className="px-2.5 text-sm text-fg-2">连接本机服务后显示任务文件夹</li>
              )}
            </ul>
            <p className="text-sm font-medium">在 agent 里这样说</p>
            <ul className="flex flex-col gap-1.5">
              {PHRASES.map((phrase) => (
                <CopyRow key={phrase} text={phrase} label={`复制「${phrase}」`} />
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
