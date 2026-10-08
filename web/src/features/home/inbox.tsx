"use client"

import { CheckCheck, Inbox } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { INBOX, type InboxTone } from "@/lib/metrics"
import { InboxRow } from "./inbox-row"

type ToneFilter = "all" | InboxTone

const TONE_OPTIONS: { value: ToneFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "risk", label: "要紧" },
  { value: "progress", label: "进行中" },
  { value: "idle", label: "稍后" },
]

/**
 * 总览最重要的区块：今天有哪些事在等你处理。
 * 清单已经按「要紧、进行中、稍后」排好序，这里只负责按轻重筛选，
 * 筛选只改显示哪几行，标题旁的数量跟着当前显示的条数变，清单本身不动。
 */
export function HomeInbox() {
  const [tone, setTone] = useState<ToneFilter>("all")
  const items = tone === "all" ? INBOX : INBOX.filter((item) => item.tone === tone)

  return (
    <section id="inbox" aria-labelledby="inbox-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Inbox className="size-4 text-fg-2" aria-hidden />
        <h2 id="inbox-title" className="text-sm font-medium">
          待处理
        </h2>
        <span className="text-sm text-fg-2 tabular" data-inbox-count>
          {items.length}
        </span>
        <div className="ml-auto" data-inbox-filter>
          {/* 写明泛型：setState 的参数类型带函数形式，不写的话会被推成 string */}
          <Segmented<ToneFilter> label="筛选待处理" value={tone} onChange={setTone} options={TONE_OPTIONS} />
        </div>
      </div>
      {items.length === 0 ? (
        // 整份清单本来就空，和筛选后这一类没有，说的是两件事
        <EmptyState icon={CheckCheck} title={INBOX.length === 0 ? "没有待处理的事" : "这一类没有待处理的事"} />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <InboxRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default HomeInbox
