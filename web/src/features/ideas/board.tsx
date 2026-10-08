"use client"

import { Lightbulb } from "lucide-react"
import { useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { BoardColumn } from "@/components/base/board"
import { EmptyState } from "@/components/base/empty-state"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ACCOUNTS } from "@/data/accounts"
import { IDEA_STATUS_LABEL, IDEA_STATUS_ORDER } from "@/data/labels"
import type { Idea } from "@/data/types"
import { useIdeas } from "@/state/ideas"
import { IdeaCard } from "./board-card"
import { IdeaStatusIcon } from "./board-icons"

const ALL_ACCOUNTS = "all"

/** 看板列数：不显示搁置时一行四列，显示搁置时五列。类名按状态写全，Tailwind 才认得 */
const BOARD_GRID = {
  hidden: "grid items-start gap-(--gap-card) md:grid-cols-2 xl:grid-cols-4",
  shown: "grid items-start gap-(--gap-card) md:grid-cols-2 xl:grid-cols-5",
} as const

/** 新的排上面。所有时间都是同一种北京时间写法，直接比字符串就是比先后 */
function newestFirst(a: Idea, b: Idea): number {
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}

/** 灵感看板：按状态分列，可以只看某个账号的灵感，搁置的默认收起来 */
export function IdeaBoard() {
  // 灵感列表在共享状态里，速记框、素材、总览和侧栏的计数改了这里都会跟着变
  const ideas = useIdeas((state) => state.ideas)
  const [filterAccount, setFilterAccount] = useState(ALL_ACCOUNTS)
  const [showShelved, setShowShelved] = useState(false)

  const statuses = showShelved ? IDEA_STATUS_ORDER : IDEA_STATUS_ORDER.filter((status) => status !== "shelved")
  const scoped = filterAccount === ALL_ACCOUNTS ? ideas : ideas.filter((idea) => idea.accountId === filterAccount)
  const columns = statuses.map((status) => ({
    status,
    items: scoped.filter((idea) => idea.status === status).sort(newestFirst),
  }))
  // 标题旁的数字是当前看板上实际摆出来的张数
  const visibleCount = columns.reduce((sum, column) => sum + column.items.length, 0)

  return (
    <section id="board" aria-labelledby="board-title">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <h2 id="board-title" className="text-sm font-medium">
          灵感
        </h2>
        <span className="text-sm text-fg-2 tabular" data-idea-count>
          {visibleCount}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger size="sm" className="h-6 w-auto text-xs" data-idea-filter>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS}>全部账号</SelectItem>
              {ACCOUNTS.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <AccountTag account={account} showPlatform />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Switch id="show-shelved" checked={showShelved} onCheckedChange={setShowShelved} data-idea-shelved />
            <Label htmlFor="show-shelved" className="text-xs text-fg-2">
              显示搁置
            </Label>
          </div>
        </div>
      </div>

      {visibleCount === 0 ? (
        <EmptyState icon={Lightbulb} title={filterAccount === ALL_ACCOUNTS ? "还没有灵感" : "这个号还没有灵感"} />
      ) : (
        <div className={BOARD_GRID[showShelved ? "shown" : "hidden"]}>
          {columns.map(({ status, items }) => (
            <BoardColumn
              key={status}
              title={IDEA_STATUS_LABEL[status]}
              count={items.length}
              icon={<IdeaStatusIcon status={status} className="size-4 text-fg-2" />}
              headingLevel={3}
              className="min-w-0"
            >
              {items.length === 0 ? (
                <p className="px-2 py-3 text-xs text-fg-2">没有灵感</p>
              ) : (
                items.map((idea) => <IdeaCard key={idea.id} idea={idea} />)
              )}
            </BoardColumn>
          ))}
        </div>
      )}
    </section>
  )
}

export default IdeaBoard
