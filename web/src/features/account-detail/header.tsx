import { Delta } from "@/components/base/delta"
import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { PLATFORMS, accountById } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import type { AccountStage, LabelColor } from "@/data/types"
import { formatCount, formatDay, formatSigned } from "@/lib/format"
import { summaryOf } from "@/lib/metrics"

/** 阶段标签的色点，和账号页一致 */
const STAGE_COLOR: Record<AccountStage, LabelColor> = {
  active: "green",
  preparing: "amber",
  paused: "gray",
}

/** D1 账号头：只放客观的数（粉丝、增减、发布），不设目标。拿数据的工具还没做的号，数据格显示「—」 */
export function AccountHeader({ accountId }: { accountId: string }) {
  const account = accountById(accountId)
  const summary = summaryOf(accountId)
  const { hasData } = summary

  return (
    <section id="overview" aria-label="账号概况" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <PlatformMark platform={account.platform} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs text-fg-2">
            {PLATFORMS[account.platform].name} · {account.handle}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <LabelChip color={STAGE_COLOR[account.stage]}>{STAGE_LABEL[account.stage]}</LabelChip>
          <span className="hidden text-xs text-fg-2 sm:inline">开号 {formatDay(account.since)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-line pt-3 sm:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-fg-2">{account.audienceLabel}</span>
          <span className="text-xl font-medium tabular" data-profile-followers>
            {hasData ? formatCount(summary.followers) : "—"}
          </span>
          {hasData && (
            <span className="flex items-center gap-1 text-xs text-fg-2">
              近 7 天 <Delta value={summary.followers7d} kind="count" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-fg-2">近 30 天</span>
          <span className="text-sm font-medium tabular">{hasData ? formatSigned(summary.followers30d) : "—"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-fg-2">本周发布</span>
          <span className="text-sm font-medium tabular">{summary.postsThisWeek}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-fg-2">已发作品</span>
          <span className="text-sm font-medium tabular">{summary.works}</span>
          <span className="text-xs text-fg-2 tabular">
            {summary.lastPublishedAt ? `上次 ${formatDay(summary.lastPublishedAt)}` : "还没发过"}
          </span>
        </div>
      </div>

      {summary.stale && summary.daysSincePublish !== null && (
        <div data-stale-banner className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-raised px-3 py-2 text-sm">
          <StatusIcon glyph="alert" tone="risk" />
          <span>已经 {summary.daysSincePublish} 天没更新</span>
        </div>
      )}
    </section>
  )
}

export default AccountHeader
