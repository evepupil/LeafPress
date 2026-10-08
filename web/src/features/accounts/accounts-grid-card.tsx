import { cn } from "cn"
import Link from "next/link"
import type { ReactNode } from "react"

import { MiniBars } from "@/components/base/bars"
import { Delta } from "@/components/base/delta"
import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { SourceBadge } from "@/components/base/source-badge"
import { PLATFORMS } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import type { AccountStage, DataSource, LabelColor, PlatformId } from "@/data/types"
import { formatCount } from "@/lib/format"
import type { AccountSummary } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import type { NewAccount } from "./accounts-grid-dialog"

/** 阶段标签的色点：运营中绿、筹备中黄、暂停灰。按对象映射取值，不拼接 */
const STAGE_COLOR: Record<AccountStage, LabelColor> = {
  active: "green",
  preparing: "amber",
  paused: "gray",
}

/** 刚加的账号还没有任何数据：手填、从没拉过 */
const NEW_ACCOUNT_SOURCE: DataSource = { mode: "manual", provider: "", schedule: "", lastResult: "never" }

/** 卡片第一行：平台标识 + 名字与副标题 + 右侧标签。长名字在中间一栏被截断，标签不会被挤掉 */
function CardHead({ platform, name, subtitle, chips }: { platform: PlatformId; name: string; subtitle: string; chips: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlatformMark platform={platform} size={28} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-fg-2">{subtitle}</p>
      </div>
      <div className="ml-auto flex shrink-0 gap-1">{chips}</div>
    </div>
  )
}

/** 三格数据里的一格：上面小标签，下面数值 */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-fg-2">{label}</span>
      {children}
    </div>
  )
}

/** 现有账号的卡片：整张是链接，点开进账号详情 */
export function AccountCard({ summary }: { summary: AccountSummary }) {
  const {
    account: a,
    followers,
    followers7d,
    reads7d,
    readsChange,
    postsThisWeek,
    postsTarget,
    weeklyGain,
    stale,
    daysSincePublish,
  } = summary
  return (
    <Link
      href={`/accounts/${a.id}/`}
      data-account-card={a.id}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-card px-4 py-3 shadow-sm transition-[border-color] duration-(--dur-fast) hover:border-line-3",
        focusRing,
      )}
    >
      <CardHead
        platform={a.platform}
        name={a.name}
        subtitle={`${PLATFORMS[a.platform].name} · ${a.handle}`}
        chips={
          <>
            <LabelChip color={STAGE_COLOR[a.stage]}>{STAGE_LABEL[a.stage]}</LabelChip>
            {stale && daysSincePublish !== null && <LabelChip color="red">{`${daysSincePublish} 天没更新`}</LabelChip>}
          </>
        }
      />
      <p className="line-clamp-2 text-sm text-fg-2">{a.positioning}</p>
      {/* 数值加涨跌放在一行；格子窄时涨跌换到下一行，不撑破卡片 */}
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-2.5">
        <Stat label={a.audienceLabel}>
          <span className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-medium tabular" data-account-followers>
              {formatCount(followers)}
            </span>
            <Delta value={followers7d} kind="count" />
          </span>
        </Stat>
        <Stat label="本周发布">
          <span className="text-sm font-medium tabular">{`${postsThisWeek}/${postsTarget}`}</span>
        </Stat>
        <Stat label={`近 7 天${a.readsLabel}`}>
          <span className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-medium tabular">{formatCount(reads7d)}</span>
            <Delta value={readsChange} />
          </span>
        </Stat>
      </div>
      <div className="flex flex-wrap gap-1">
        {a.columns.map((column) => (
          <LabelChip key={column.id} color={column.color}>
            {column.name}
          </LabelChip>
        ))}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <SourceBadge source={a.dataSource} />
        <MiniBars values={weeklyGain} className="ml-auto" />
      </div>
    </Link>
  )
}

/** 弹窗里刚加的账号：虚线边框，不是链接（还没有详情页），只有身份信息和「还没有数据」 */
export function NewAccountCard({ n, account }: { n: number; account: NewAccount }) {
  return (
    <div
      data-account-card={`new-${n}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-dashed border-line-3 bg-card px-4 py-3"
    >
      <CardHead
        platform={account.platform}
        name={account.name}
        subtitle={`${PLATFORMS[account.platform].name} · 待定`}
        chips={<LabelChip color={STAGE_COLOR.preparing}>{STAGE_LABEL.preparing}</LabelChip>}
      />
      {account.positioning && <p className="line-clamp-2 text-sm text-fg-2">{account.positioning}</p>}
      <SourceBadge source={NEW_ACCOUNT_SOURCE} className="self-start" />
    </div>
  )
}
