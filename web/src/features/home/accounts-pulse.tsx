import { cn } from "cn"
import { UsersRound } from "lucide-react"
import Link from "next/link"

import { AccountTag } from "@/components/base/account-tag"
import { MiniBars } from "@/components/base/bars"
import { BoardColumn } from "@/components/base/board"
import { Delta } from "@/components/base/delta"
import { LabelChip } from "@/components/base/label-chip"
import { ProgressMeter } from "@/components/base/progress-meter"
import { SourceBadge } from "@/components/base/source-badge"
import { ACCOUNTS } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import { formatCount } from "@/lib/format"
import { ACCOUNT_SUMMARIES, type AccountSummary } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/** 一个账号一张白卡：整张卡是链接，点进这个号的详情页 */
function AccountCard({ summary }: { summary: AccountSummary }) {
  const { account, followers, followers7d, weeklyGain, postsThisWeek, postsTarget, stale, daysSincePublish } = summary
  return (
    <Link
      href={`/accounts/${account.id}/`}
      data-account-card={account.id}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-card px-3 py-2.5 shadow-sm transition-[border-color] duration-(--dur-fast) hover:border-line-3",
        focusRing,
      )}
    >
      {/* 第一行：账号名牌；右边的标签最多出现一个（筹备中的号不会断更，因为断更只算运营中的号） */}
      <div className="flex min-w-0 items-center gap-2">
        <AccountTag account={account} size="md" showPlatform />
        {account.stage === "preparing" && (
          <LabelChip color="amber" className="ml-auto shrink-0">
            {STAGE_LABEL.preparing}
          </LabelChip>
        )}
        {stale && daysSincePublish !== null && (
          <LabelChip color="red" className="ml-auto shrink-0">
            {daysSincePublish} 天没更新
          </LabelChip>
        )}
      </div>

      {/* 第二行：粉丝数、近 7 天增减、近 12 周每周涨粉的小柱子 */}
      <div className="flex items-center gap-2 text-xs text-fg-2 tabular">
        <span className="min-w-0 truncate">
          {account.audienceLabel} <span className="text-fg">{formatCount(followers)}</span>
        </span>
        <Delta value={followers7d} kind="count" />
        <MiniBars values={weeklyGain} className="ml-auto" />
      </div>

      {/* 第三行：本周发布进度、数据来源状态；目标为 0 时进度条留空 */}
      <div className="flex min-w-0 items-center gap-2 text-xs text-fg-2 tabular">
        <span className="shrink-0">
          本周 {postsThisWeek}/{postsTarget}
        </span>
        <ProgressMeter value={postsTarget ? postsThisWeek / postsTarget : 0} />
        <SourceBadge source={account.dataSource} className="ml-auto" />
      </div>
    </Link>
  )
}

export function HomeAccounts() {
  return (
    <div id="accounts" className="min-w-0">
      <BoardColumn
        icon={<UsersRound className="size-4 text-fg-2" aria-hidden />}
        title="账号"
        count={ACCOUNTS.length}
        actions={
          <Link href="/accounts/" className={cn("rounded-md px-1.5 text-xs text-fg-2 hover:text-fg", focusRing)}>
            全部
          </Link>
        }
      >
        {ACCOUNT_SUMMARIES.map((summary) => (
          <AccountCard key={summary.account.id} summary={summary} />
        ))}
      </BoardColumn>
    </div>
  )
}

export default HomeAccounts
