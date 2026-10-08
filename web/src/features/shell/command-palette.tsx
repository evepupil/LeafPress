"use client"

import { Bot, Lightbulb, Plus, SquarePen } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { PlatformMark } from "@/components/base/marks"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { IDEA_STATUS_LABEL } from "@/data/labels"
import { WORKFLOWS } from "@/data/workflows"
import { pickNext } from "@/lib/work-engine"
import { useIdeas } from "@/state/ideas"
import { useUi } from "@/state/ui"
import { useWorks } from "@/state/works"
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
  const allWorks = useWorks((state) => state.works)
  const runAi = useWorks((state) => state.runAi)
  const ideas = useIdeas((state) => state.ideas)
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const pages = PAGES.filter((page) => hit(q, page.label))
  const accounts = ACCOUNTS.filter((account) => hit(q, account.name, PLATFORMS[account.platform].name))
  const works = q
    ? allWorks.filter((work) => hit(q, work.title, work.id, PLATFORMS[accountById(work.accountId).platform].name))
    : [...allWorks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_WORKS)
  const matchedIdeas = q ? ideas.filter((idea) => hit(q, idea.text, idea.detail)) : []
  const workflows = q ? WORKFLOWS.filter((workflow) => hit(q, workflow.name, workflow.say)) : []
  const actions = [
    { key: "capture", label: "记一条灵感", icon: <SquarePen />, shortcut: "N", run: () => setCaptureOpen(true) },
    { key: "new-work", label: "新建作品", icon: <Plus />, run: () => setNewWorkOpen(true) },
    {
      key: "pick-next",
      label: "让 AI 挑一个做",
      icon: <Bot />,
      run: () => {
        const next = pickNext(allWorks)
        if (!next) return toast("待实现里没有能直接做的")
        runAi(next.id)
        router.push(`/?open=${next.id}`)
        toast(`AI 开始做《${next.title}》`)
      },
    },
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
                <CommandShortcut className="shrink-0">{PLATFORMS[accountById(work.accountId).platform].name}</CommandShortcut>
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
            {accounts.map((account) => (
              <CommandItem key={account.id} value={`account-${account.id}`} onSelect={() => go(`/accounts/${account.id}/`)}>
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
                <PlatformMark platform={workflow.platform} size={16} />
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
