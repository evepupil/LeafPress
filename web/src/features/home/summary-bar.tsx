import { cn } from "cn"
import { ChevronRight } from "lucide-react"
import Link from "next/link"

import { Delta } from "@/components/base/delta"
import { FilterBar } from "@/features/shell/page-frame"
import { formatCount } from "@/lib/format"
import { ACCOUNT_SUMMARIES, INBOX, type AccountSummary } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/** 把每个账号的某一项加起来 */
function total(pick: (summary: AccountSummary) => number): number {
  return ACCOUNT_SUMMARIES.reduce((sum, summary) => sum + pick(summary), 0)
}

/**
 * 总览的概况条，放在筛选栏的位置：待处理、本周已发、粉丝、近 7 天阅读。
 * 数字都从待处理清单和各账号概况加出来，不写死。
 * 本周的目标篇数只算运营中的账号，筹备中的号还没有发文计划。
 */
export function HomeSummaryBar() {
  const postsDone = total((summary) => summary.postsThisWeek)
  const postsTarget = ACCOUNT_SUMMARIES.filter((summary) => summary.account.stage === "active").reduce(
    (sum, summary) => sum + summary.postsTarget,
    0,
  )

  return (
    <FilterBar
      left={
        <span className="flex items-center gap-3 text-xs text-fg-2 tabular">
          <span data-summary="inbox">
            待处理 <span className="text-fg">{INBOX.length}</span>
          </span>
          <span data-summary="posts">
            本周已发 <span className="text-fg">{`${postsDone}/${postsTarget}`}</span>
          </span>
          {/* 手机只留前两段，sm 起显示粉丝，md 起显示阅读 */}
          <span data-summary="followers" className="hidden items-center gap-1 sm:inline-flex">
            粉丝 <span className="text-fg">{formatCount(total((summary) => summary.followers))}</span>
            <Delta value={total((summary) => summary.followers7d)} kind="count" />
          </span>
          <span data-summary="reads" className="hidden md:inline">
            近 7 天阅读 <span className="text-fg">{formatCount(total((summary) => summary.reads7d))}</span>
          </span>
        </span>
      }
      right={
        <Link href="/reports/" className={cn("inline-flex items-center gap-0.5 text-xs text-fg-2 hover:text-fg", focusRing)}>
          上周周报
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      }
    />
  )
}

export default HomeSummaryBar
