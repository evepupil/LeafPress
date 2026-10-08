"use client"

import { Lightbulb, Plus, SquarePen, Workflow } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PlatformMark } from "@/components/base/marks"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { accountHref, IDEA_STATUS_LABEL, PLATFORMS, WORKFLOWS } from "@leafpress/core"
import { useAccounts, useIdeas, useWorks } from "@/state/data"
import { useUi } from "@/state/ui"
import { PAGES } from "./nav"

/** 关键词（不分大小写）出现在任意一段文字里就算命中；没输入时全部命中 */
function hit(query: string, ...texts: string[]): boolean {
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}

/** 没输入时作品只列最近动过的这么多个，输入后全部参与搜索 */
const RECENT_WORKS = 12

/** 面板内容只在打开时挂载，所以每次打开搜索框都是空的 */
function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const setCaptureOpen = useUi((state) => state.setCaptureOpen)
  const setNewWorkOpen = useUi((state) => state.setNewWorkOpen)
  const allWorks = useWorks()
  const ideas = useIdeas()
  const accounts = useAccounts()
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const pages = PAGES.filter((page) => hit(q, page.label))
  const accountMatches = accounts.filter((account) => hit(q, account.name, PLATFORMS[account.platform].name))
  const platformName = (accountId: string) => {
    const account = accountMap.get(accountId)
    return account ? PLATFORMS[account.platform].name : ""
  }
  const works = q
    ? allWorks.filter((work) => hit(q, work.title, work.id, platformName(work.accountId)))
    : [...allWorks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_WORKS)
  const matchedIdeas = q ? ideas.filter((idea) => hit(q, idea.text, idea.detail)) : []
  const workflows = q ? WORKFLOWS.filter((workflow) => hit(q, workflow.name, workflow.say)) : []
  const actions = [
    { key: "capture", label: "记一条灵感", icon: <SquarePen />, shortcut: "N", run: () => setCaptureOpen(true) },
    { key: "new-work", label: "新建作品", icon: <Plus />, run: () => setNewWorkOpen(true) },
  ].filter((action) => hit(q, action.label))

  return (
    // 过滤自己做（按文字包含），cmdk 只负责上下键、回车和高亮
    <Command label="搜索作品、灵感、账号" shouldFilter={false} className="rounded-none p-0">
      <CommandInput placeholder="搜索作品、灵感、账号…" value={query} onValueChange={setQuery} />
      <CommandList className="scroll-thin max-h-[min(440px,60vh)] p-1">
        <CommandEmpty>没有找到</CommandEmpty>

        {actions.length > 0 && (
          <CommandGroup heading="操作">
            {actions.map((action) => (
              <CommandItem
                key={action.key}
                value={`action-${action.key}`}
                onSelect={() => {
                  onClose()
                  action.run()
                }}
              >
                {action.icon}
                {action.label}
                {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {works.length > 0 && (
          <CommandGroup heading={q ? "作品" : "最近的作品"}>
            {works.map((work) => (
              <CommandItem key={work.id} value={`work-${work.id}`} onSelect={() => go(`/?open=${work.id}`)}>
                <WorkStatusIcon status={work.status} />
                <span className="truncate">{work.title}</span>
                <CommandShortcut className="shrink-0">{platformName(work.accountId)}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedIdeas.length > 0 && (
          <CommandGroup heading="灵感">
            {matchedIdeas.map((idea) => (
              <CommandItem key={idea.id} value={`idea-${idea.id}`} onSelect={() => go(`/ideas/?open=${idea.id}`)}>
                <Lightbulb />
                <span className="truncate">{idea.text}</span>
                <CommandShortcut className="shrink-0">{IDEA_STATUS_LABEL[idea.status]}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

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
            {accountMatches.map((account) => (
              <CommandItem key={account.id} value={`account-${account.id}`} onSelect={() => go(accountHref(account.id))}>
                <PlatformMark platform={account.platform} size={16} />
                <span className="truncate">{account.name}</span>
                <CommandShortcut>{PLATFORMS[account.platform].name}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {workflows.length > 0 && (
          <CommandGroup heading="工作流">
            {workflows.map((workflow) => (
              <CommandItem key={workflow.id} value={`workflow-${workflow.id}`} onSelect={() => go(`/workflows/#${workflow.id}`)}>
                {workflow.platform === "any" ? <Workflow /> : <PlatformMark platform={workflow.platform} size={16} />}
                <span className="truncate">{workflow.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}

/** 全局搜索：常用操作、作品、灵感、页面、账号、工作流。窗口栏的搜索框和 ⌘K / Ctrl+K 都打开它 */
export function CommandPalette() {
  const open = useUi((state) => state.commandOpen)
  const setOpen = useUi((state) => state.setCommandOpen)

  // 外壳和 CommandDialog 一样；标题和说明放进弹窗内容里，关着的时候页面上不留隐藏的标题
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="top-[18%] translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-[560px]">
        <DialogHeader className="sr-only">
          <DialogTitle>搜索</DialogTitle>
          <DialogDescription>搜索作品、灵感、账号，或者跳到某个页面</DialogDescription>
        </DialogHeader>
        <PaletteBody onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
