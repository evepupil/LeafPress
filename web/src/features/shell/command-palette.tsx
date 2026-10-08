"use client"

import { SquarePen } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PlatformMark } from "@/components/base/marks"
import { ToolStatusIcon, WorkStatusIcon } from "@/components/base/state-icons"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { TOOL_STATUS_LABEL } from "@/data/labels"
import { TOOLS } from "@/data/tools"
import { WORK_ROWS } from "@/lib/metrics"
import { useUi } from "@/state/ui"
import { PAGES } from "./nav"

/** 关键词（不分大小写）出现在任意一段文字里就算命中；没输入时全部命中 */
function hit(query: string, ...texts: string[]): boolean {
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}

/** 面板内容只在打开时挂载，所以每次打开搜索框都是空的 */
function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const setCaptureOpen = useUi((state) => state.setCaptureOpen)
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const pages = PAGES.filter((page) => hit(q, page.label))
  const accounts = ACCOUNTS.filter((account) => hit(q, account.name, PLATFORMS[account.platform].name))
  const tools = TOOLS.filter((tool) => hit(q, tool.name))
  // 作品全部参与搜索（不再只取最近的几个），找作品是这个面板最常见的用法
  const works = WORK_ROWS.filter((row) => hit(q, row.work.title, PLATFORMS[row.account.platform].name))
  const showCapture = hit(q, "记一条灵感")

  return (
    // 过滤自己做（按文字包含），cmdk 只负责上下键、回车和高亮
    <Command label="搜索作品、账号、工具" shouldFilter={false} className="rounded-none p-0">
      <CommandInput placeholder="搜索作品、账号、工具…" value={query} onValueChange={setQuery} />
      <CommandList className="scroll-thin max-h-[min(440px,60vh)] p-1">
        <CommandEmpty>没有找到</CommandEmpty>

        {pages.length > 0 && (
          <CommandGroup heading="页面">
            {pages.map((page) => (
              <CommandItem key={page.key} value={`page-${page.key}`} onSelect={() => go(page.path)}>
                <page.icon />
                <span className="truncate">{page.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {accounts.length > 0 && (
          <CommandGroup heading="账号">
            {accounts.map((account) => (
              <CommandItem key={account.id} value={`account-${account.id}`} onSelect={() => go(`/accounts/${account.id}/`)}>
                <PlatformMark platform={account.platform} size={16} />
                <span className="truncate">{account.name}</span>
                <CommandShortcut>{PLATFORMS[account.platform].name}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tools.length > 0 && (
          <CommandGroup heading="工具">
            {tools.map((tool) => (
              <CommandItem key={tool.id} value={`tool-${tool.id}`} onSelect={() => go("/tools/#tools")}>
                <ToolStatusIcon status={tool.status} />
                <span className="truncate">{tool.name}</span>
                {tool.status !== "ready" && <CommandShortcut className="shrink-0">{TOOL_STATUS_LABEL[tool.status]}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {works.length > 0 && (
          <CommandGroup heading="作品">
            {works.map(({ work, account }) => (
              <CommandItem key={work.id} value={`work-${work.id} ${work.title}`} onSelect={() => go(`/works/?open=${work.id}`)}>
                <WorkStatusIcon status={work.status} />
                <span className="truncate">{work.title}</span>
                <CommandShortcut className="shrink-0">{PLATFORMS[account.platform].name}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {showCapture && (
          <CommandGroup heading="操作">
            <CommandItem
              value="action-capture"
              onSelect={() => {
                onClose()
                setCaptureOpen(true)
              }}
            >
              <SquarePen />
              记一条灵感
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}

/** 全局搜索：页面、账号、工具、作品和常用操作。窗口栏的搜索框和 ⌘K / Ctrl+K 都打开它 */
export function CommandPalette() {
  const open = useUi((state) => state.commandOpen)
  const setOpen = useUi((state) => state.setCommandOpen)

  // 外壳和 CommandDialog 一样；标题和说明放进弹窗内容里，关着的时候页面上不留隐藏的标题
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-[560px]">
        <DialogHeader className="sr-only">
          <DialogTitle>搜索</DialogTitle>
          <DialogDescription>搜索作品、账号、工具，或者跳到某个页面</DialogDescription>
        </DialogHeader>
        <PaletteBody onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
