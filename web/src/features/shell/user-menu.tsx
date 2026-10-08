"use client"

import { cn } from "cn"
import { Bot, Check, Copy, ExternalLink, Keyboard } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { IconButton } from "@/components/base/icon-button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { copyText } from "@/lib/platform"
import { focusRing } from "@/lib/styles"
import { useUi } from "@/state/ui"

/** 本机服务给 AI 助手连的地址 */
const MCP_URL = "http://localhost:3210/mcp"
const BLOG_URL = "https://blog.chaosyn.com/"
/** 复制成功后，按钮上的对勾停留多久 */
const COPIED_MS = 1600

/** 弹窗内容只在打开时挂载，所以每次打开都是「还没复制」 */
function ConnectBody() {
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [copied, setCopied] = useState(false)

  // 弹窗关掉时清掉还没走完的计时
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    if (!(await copyText(MCP_URL))) {
      // 浏览器不让写剪贴板（比如用局域网地址打开）：把地址选中，让人自己复制
      inputRef.current?.select()
      toast("已选中地址，按 Ctrl+C 复制")
      return
    }
    setCopied(true)
    toast.success("已复制")
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <DialogDescription>在 Claude Code 里说一句话就能记灵感、查数据、登记发布</DialogDescription>
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          readOnly
          value={MCP_URL}
          aria-label="MCP 地址"
          className="min-w-0 flex-1 font-mono"
          onFocus={(event) => event.target.select()}
        />
        <IconButton label="复制地址" size="icon" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="text-done" /> : <Copy />}
        </IconButton>
      </div>
    </div>
  )
}

/** 右上角的头像菜单：连接 AI 助手、快捷键、打开博客 */
export function UserMenu() {
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [connectOpen, setConnectOpen] = useState(false)

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
          <DropdownMenuItem onSelect={() => setConnectOpen(true)}>
            <Bot />
            连接 AI 助手
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
            <Keyboard />
            快捷键
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={BLOG_URL} target="_blank" rel="noreferrer">
              <ExternalLink />
              打开博客
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent
          className="gap-0 p-0 sm:max-w-[440px]"
          onOpenAutoFocus={(event) => {
            // 免得一打开地址就被整段选中：焦点先放在弹窗本身，按 Tab 再进输入框
            event.preventDefault()
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
          }}
          // 弹窗是从头像菜单里点开的，关掉后焦点回到头像
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <DialogHeader className="border-b border-line px-4 py-3">
            <DialogTitle>连接 AI 助手</DialogTitle>
          </DialogHeader>
          <ConnectBody />
        </DialogContent>
      </Dialog>
    </>
  )
}
