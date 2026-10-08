"use client"

import { cn } from "cn"
import { FileText } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Spinner, WorkStatusIcon } from "@/components/base/state-icons"
import { accountById } from "@/data/accounts"
import type { Work } from "@/data/types"
import { formatDay } from "@/lib/format"
import { metricText } from "@/lib/metrics"
import { focusRing, focusRingInset } from "@/lib/styles"
import { progressText, waitingLabel, workflowOf } from "@/lib/work-engine"
import { useWorks } from "@/state/works"
import { orderAccountWorks } from "./works-order"

/** 列表最多显示几条，其余用「还有 N 条」收起来 */
const VISIBLE_ROWS = 8

/** 第二行说明：待实现写工作流，进行中写走到哪一步，等你处理写要你做什么（警示色，例如「你去知乎投递」），已完成写发布日 */
function subtitleOf(work: Work): { text: string; warn: boolean } {
  switch (work.status) {
    case "todo":
      return { text: workflowOf(work).name, warn: false }
    case "doing":
      return { text: progressText(work), warn: false }
    case "waiting":
      return { text: waitingLabel(work), warn: true }
    case "done":
      return { text: work.publishedAt ? formatDay(work.publishedAt) : "已完成", warn: false }
  }
}

/** D6 作品：这个号上的全部作品（也就是全部任务），要你动手的排最前，点一条在作品页打开它 */
export function AccountWorks({ accountId }: { accountId: string }) {
  const works = useWorks((state) => state.works)
  const running = useWorks((state) => state.running)
  const ordered = useMemo(() => orderAccountWorks(works, accountId), [works, accountId])
  const visible = ordered.slice(0, VISIBLE_ROWS)
  const rest = ordered.length - visible.length
  const allHref = `/?platform=${accountById(accountId).platform}`

  return (
    <section id="works" aria-labelledby="account-works-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <FileText className="size-4 text-fg-2" aria-hidden />
        <h2 id="account-works-title" className="text-sm font-medium">
          作品
        </h2>
        <span className="text-sm text-fg-2 tabular" data-account-works-count>
          {ordered.length}
        </span>
        <Link href={allHref} className={cn("ml-auto text-xs text-fg-2 hover:text-fg", focusRing)}>
          看全部
        </Link>
      </div>

      {ordered.length === 0 ? (
        <EmptyState icon={FileText} title="还没有作品" />
      ) : (
        <ul>
          {visible.map((work) => {
            const subtitle = subtitleOf(work)
            return (
              <li key={work.id}>
                <Link
                  href={`/?open=${work.id}`}
                  data-account-work={work.id}
                  className={cn(
                    "flex h-12 min-w-0 items-center gap-2 px-3 transition-colors duration-(--dur-fast) hover:bg-hover",
                    focusRingInset,
                  )}
                >
                  {/* AI 正在做的作品用转圈，和作品页保持一致 */}
                  {running.includes(work.id) ? <Spinner /> : <WorkStatusIcon status={work.status} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{work.title}</p>
                    <p className={cn("truncate text-xs", subtitle.warn ? "text-warn" : "text-fg-2")}>{subtitle.text}</p>
                  </div>
                  {work.status === "done" && <span className="shrink-0 text-xs tabular">{metricText(work, "reads")}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {rest > 0 && (
        <Link href={allHref} className={cn("flex h-9 items-center px-3 text-xs text-fg-2 hover:bg-hover", focusRingInset)}>
          还有 {rest} 条
        </Link>
      )}
    </section>
  )
}

export default AccountWorks
