"use client"

import { Lightbulb } from "lucide-react"
import { useState } from "react"
import type { SubmitEvent } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { ColorDot } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS } from "@/data/accounts"
import { IDEA_SOURCE_LABEL } from "@/data/labels"
import type { IdeaSource } from "@/data/types"
import { useIdeas } from "@/state/ideas"
import { IdeaSourceIcon } from "./board-icons"

/** 下拉的选项值不能是空字符串，「不挂账号」用这个占位值，存进状态时换回 "" */
const NO_ACCOUNT = "none"

/** 来源的显示顺序跟着 IDEA_SOURCE_LABEL 的书写顺序 */
const SOURCES = Object.keys(IDEA_SOURCE_LABEL) as IdeaSource[]

/** 顶部速记框：写一句话回车就记下，可以顺手挂到某个账号的某个栏目上 */
export function IdeaCapture() {
  const ideas = useIdeas((state) => state.ideas)
  const add = useIdeas((state) => state.add)
  const [text, setText] = useState("")
  // accountId 为 "" 表示不挂账号；栏目只在挂了账号时才有意义
  const [accountId, setAccountId] = useState("")
  const [columnId, setColumnId] = useState("")

  const account = ACCOUNTS.find((item) => item.id === accountId)
  const sourceCounts = SOURCES.map((source) => ({
    source,
    count: ideas.filter((idea) => idea.source === source).length,
  }))

  // 换账号时栏目回到这个账号的第一个，不挂账号时栏目清空
  function changeAccount(value: string) {
    const next = value === NO_ACCOUNT ? "" : value
    setAccountId(next)
    setColumnId(ACCOUNTS.find((item) => item.id === next)?.columns[0]?.id ?? "")
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    add({
      text: value,
      accountId: accountId || undefined,
      columnId: accountId ? columnId : undefined,
      source: "quick",
    })
    toast.success("记下了")
    // 账号和栏目留着，连着记几条同一个号的灵感时不用重新选
    setText("")
  }

  return (
    <section id="capture" aria-label="记灵感" className="rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm">
      <form className="flex flex-wrap items-center gap-1.5 md:flex-nowrap" onSubmit={submit}>
        <Lightbulb className="hidden size-4 shrink-0 text-fg-2 md:block" aria-hidden />
        <Input
          id="idea-capture-input"
          data-idea-input
          aria-label="灵感"
          placeholder="记一条灵感，回车记下"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="h-7 w-full md:flex-1"
        />
        <Select value={accountId || NO_ACCOUNT} onValueChange={changeAccount}>
          <SelectTrigger className="h-7 w-auto min-w-28 text-xs" data-idea-account>
            <SelectValue />
          </SelectTrigger>
          {/* 速记框在页面顶部：默认的「对齐选中项」会让靠后的选项把列表上半截顶出屏幕，改成从触发器下方弹出 */}
          <SelectContent position="popper">
            <SelectItem value={NO_ACCOUNT}>不挂账号</SelectItem>
            {ACCOUNTS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <AccountTag account={item} showPlatform />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* key 跟着账号走：换账号就重建这个下拉。栏目选项和默认栏目是同一帧出现的，
            不重建的话，下拉内部的表单同步会在选项登记好之前把栏目写回空值，默认栏目就丢了 */}
        <Select key={accountId} value={account ? columnId : ""} onValueChange={setColumnId} disabled={!account}>
          <SelectTrigger className="h-7 w-auto min-w-24 text-xs" data-idea-column>
            <SelectValue placeholder="栏目" />
          </SelectTrigger>
          <SelectContent position="popper">
            {account?.columns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                <ColorDot color={column.color} />
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" data-idea-submit disabled={!text.trim()}>
          记下
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-fg-2" data-idea-sources>
        {sourceCounts.map(({ source, count }) =>
          count > 0 ? (
            <span key={source} className="inline-flex items-center gap-1">
              <IdeaSourceIcon source={source} className="size-3 text-fg-3" />
              <span>
                {IDEA_SOURCE_LABEL[source]} <span className="tabular">{count}</span>
              </span>
            </span>
          ) : null,
        )}
      </div>
    </section>
  )
}

export default IdeaCapture
