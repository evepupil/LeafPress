"use client"

import { cn } from "cn"
import { Bookmark, FolderGit2, Lightbulb, PenLine, Sparkles, TrendingUp, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IdeaSource } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { focusRing } from "@/lib/styles"
import { useIdeas } from "@/state/ideas"

/** 总览里只列最近记下的几条，完整的在灵感页 */
const RECENT_LIMIT = 4

/** 灵感来源对应的小图标 */
const SOURCE_ICON: Record<IdeaSource, LucideIcon> = {
  quick: PenLine,
  devlog: FolderGit2,
  cloudmind: Sparkles,
  bookmark: Bookmark,
  trend: TrendingUp,
}

export function HomeCapture() {
  const [text, setText] = useState("")
  const ideas = useIdeas((state) => state.ideas)
  const add = useIdeas((state) => state.add)

  // 按记下的时间从新到旧排。同一时刻记下的几条时间相同，排序是稳定的，
  // 而新灵感本来就插在列表最前面，所以后记的会排在先记的前面。
  const recent = useMemo(() => [...ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_LIMIT), [ideas])

  // 回车或点「记下」都走这里：先去掉首尾空白，空内容不记，记完清空输入框
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    add({ text: value, source: "quick" })
    toast.success("记下了")
    setText("")
  }

  return (
    <section id="capture" aria-labelledby="capture-title" className="rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <Lightbulb className="size-4 text-fg-2" aria-hidden />
        <h2 id="capture-title" className="text-sm font-medium">
          记灵感
        </h2>
        <Link href="/ideas/" className={cn("ml-auto text-xs text-fg-2 hover:text-fg", focusRing)}>
          全部灵感
        </Link>
      </div>

      <form className="flex items-center gap-1.5" onSubmit={submit}>
        <Input
          id="home-capture"
          data-capture-input
          aria-labelledby="capture-title"
          placeholder="一句话就行，回车记下"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="h-7"
        />
        <Button type="submit" size="sm" data-capture-submit disabled={!text.trim()}>
          记下
        </Button>
      </form>

      {recent.length > 0 ? (
        <ul className="mt-2 flex flex-col">
          {recent.map((idea) => {
            const SourceIcon = SOURCE_ICON[idea.source]
            return (
              <li key={idea.id} data-capture-idea={idea.id} className="flex h-8 min-w-0 items-center gap-2">
                <SourceIcon className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm" title={idea.text}>
                  {idea.text}
                </span>
                <span className="shrink-0 text-xs text-fg-2 tabular">{formatRelative(idea.createdAt)}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-fg-2">还没有灵感</p>
      )}
    </section>
  )
}

export default HomeCapture
