import { cn } from "cn"
import { FileText } from "lucide-react"
import Link from "next/link"

import { EmptyState } from "@/components/base/empty-state"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { PUB_FORMAT_LABEL, PUB_STATE_LABEL } from "@/data/labels"
import type { Publication } from "@/data/types"
import { workById } from "@/data/works"
import { formatDay } from "@/lib/format"
import { focusRing, focusRingInset } from "@/lib/styles"
import { metricText } from "@/lib/metrics"
import { orderAccountPubs } from "./works-order"

/** 列表最多显示几条，其余用「还有 N 条」收起来 */
const VISIBLE_ROWS = 8

/** 第二行说明：已发写发布日，其余写状态（已排期再带上排期日） */
function subtitleOf(pub: Publication): string {
  const format = PUB_FORMAT_LABEL[pub.format]
  if (pub.state === "published") return pub.publishedAt ? `${format} · ${formatDay(pub.publishedAt)}` : format
  const state = `${format} · ${PUB_STATE_LABEL[pub.state]}`
  return pub.state === "scheduled" && pub.plannedFor ? `${state} · ${formatDay(pub.plannedFor)}` : state
}

export function AccountWorks({ accountId }: { accountId: string }) {
  const pubs = orderAccountPubs(accountId)
  const visible = pubs.slice(0, VISIBLE_ROWS)
  const rest = pubs.length - visible.length
  const allHref = `/works/?account=${accountId}`

  return (
    <section id="works" aria-labelledby="account-works-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <FileText className="size-4 text-fg-2" aria-hidden />
        <h2 id="account-works-title" className="text-sm font-medium">
          作品
        </h2>
        <span className="text-sm text-fg-2 tabular" data-account-works-count>
          {pubs.length}
        </span>
        <Link href={allHref} className={cn("ml-auto text-xs text-fg-2 hover:text-fg", focusRing)}>
          看全部
        </Link>
      </div>

      {pubs.length === 0 ? (
        <EmptyState icon={FileText} title="还没有作品" />
      ) : (
        <ul>
          {visible.map((pub) => {
            const work = workById(pub.workId)
            return (
              <li key={pub.id}>
                <Link
                  href={`/works/?open=${pub.workId}`}
                  data-account-work={pub.id}
                  className={cn(
                    "flex h-12 min-w-0 items-center gap-2 px-3 transition-colors duration-(--dur-fast) hover:bg-hover",
                    focusRingInset,
                  )}
                >
                  <WorkStatusIcon status={work.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{work.title}</p>
                    <p className="truncate text-xs text-fg-2">{subtitleOf(pub)}</p>
                  </div>
                  {pub.state === "published" && <span className="shrink-0 text-xs tabular">{metricText(pub, "reads")}</span>}
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
