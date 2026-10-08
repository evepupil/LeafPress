"use client"

import Link from "next/link"
import { type ReactNode, useMemo } from "react"

import { MiniBars } from "@/components/base/bars"
import { Delta } from "@/components/base/delta"
import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { SourceBadge } from "@/components/base/source-badge"
import { PLATFORMS } from "@/data/accounts"
import { SETUP_STATE_LABEL, STAGE_LABEL } from "@/data/labels"
import type { AccountStage, DataSource, LabelColor, PlatformId, SetupState } from "@/data/types"
import { formatCount } from "@/lib/format"
import { markdownSummary } from "@/lib/markdown"
import type { AccountSummary } from "@/lib/metrics"
import { setupView } from "@/lib/setup"
import { useAccounts, useProfile } from "@/state/accounts"
import type { NewAccount } from "./accounts-grid-dialog"
import { AccountTasks } from "./accounts-grid-tasks"

/** 阶段标签的色点：运营中绿、筹备中黄、暂停灰。按对象映射取值，不拼接 */
const STAGE_COLOR: Record<AccountStage, LabelColor> = {
  active: "green",
  preparing: "amber",
  paused: "gray",
}

/** 接入状态的色点：接好了绿、有问题红、没接完黄 */
const SETUP_COLOR: Record<SetupState, LabelColor> = {
  ready: "green",
  broken: "red",
  unfinished: "amber",
}

/** 刚加的账号还没接：拿数据的工具、要配的东西都等接这个平台时再定 */
const NEW_ACCOUNT_SOURCE: DataSource = { mode: "crawler", provider: "", schedule: "", status: "missing" }

/**
 * 整张卡片都能点，又不让链接套链接（卡片里还有一条「手上的活」链接）：
 * 点开账号详情的链接只包住名字和平台，它的伪元素铺满整张卡片（外层是 relative）。
 * 键盘焦点的描边也画在这一层上，框住整张卡片。
 */
const CARD_LINK =
  "min-w-0 outline-none after:absolute after:-inset-px after:rounded-lg focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-offset-1 focus-visible:after:outline-(--focus-ring)"

/**
 * 卡片第一行：平台标识 + 名字与副标题 + 右侧标签。长名字在中间一栏被截断，标签不会被挤掉。
 * 传了 href，名字和副标题就是进详情页的链接；不传（刚加的账号还没有详情页）就是普通文字。
 */
function CardHead({
  platform,
  name,
  subtitle,
  chips,
  href,
}: {
  platform: PlatformId
  name: string
  subtitle: string
  chips: ReactNode
  href?: string
}) {
  const text = (
    <>
      <p className="truncate text-sm font-medium">{name}</p>
      <p className="truncate text-xs text-fg-2">{subtitle}</p>
    </>
  )
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlatformMark platform={platform} size={28} />
      {href ? (
        <Link href={href} className={CARD_LINK}>
          {text}
        </Link>
      ) : (
        <div className="min-w-0">{text}</div>
      )}
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

/** 现有账号的卡片：点卡片任何地方进账号详情，「手上的活」单独去作品页 */
export function AccountCard({ summary }: { summary: AccountSummary }) {
  const { account: a, hasData, followers, followers7d, reads7d, readsChange, postsThisWeek, weeklyGain, stale, daysSincePublish } = summary
  const profile = useProfile(a.id)
  const config = useAccounts((state) => state.config[a.id])
  const pull = useAccounts((state) => state.pulls[a.id])
  const setup = useMemo(() => setupView(a, config, pull), [a, config, pull])
  const intro = useMemo(() => markdownSummary(profile), [profile])
  return (
    <div
      data-account-card={a.id}
      className="relative isolate flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-card px-4 py-3 shadow-sm transition-[border-color] duration-(--dur-fast) hover:border-line-3"
    >
      <CardHead
        href={`/accounts/${a.id}/`}
        platform={a.platform}
        name={a.name}
        subtitle={`${PLATFORMS[a.platform].name} · ${a.handle}`}
        chips={
          <>
            <LabelChip color={STAGE_COLOR[a.stage]}>{STAGE_LABEL[a.stage]}</LabelChip>
            <span data-setup-state={setup.state} className="contents">
              <LabelChip color={SETUP_COLOR[setup.state]} title={setup.gaps.join("；")}>
                {SETUP_STATE_LABEL[setup.state]}
              </LabelChip>
            </span>
            {stale && daysSincePublish !== null && <LabelChip color="red">{`${daysSincePublish} 天没更新`}</LabelChip>}
          </>
        }
      />
      {intro && <p className="line-clamp-2 text-sm text-fg-2">{intro}</p>}
      {/* 数值加涨跌放在一行；格子窄时涨跌换到下一行，不撑破卡片 */}
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-2.5">
        <Stat label={a.audienceLabel}>
          <span className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-medium tabular" data-account-followers>
              {hasData ? formatCount(followers) : "—"}
            </span>
            {hasData && <Delta value={followers7d} kind="count" />}
          </span>
        </Stat>
        <Stat label="本周发布">
          <span className="text-sm font-medium tabular">{postsThisWeek}</span>
        </Stat>
        <Stat label={`近 7 天${a.readsLabel}`}>
          <span className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-medium tabular">{hasData ? formatCount(reads7d) : "—"}</span>
            {hasData && <Delta value={readsChange} />}
          </span>
        </Stat>
      </div>
      <AccountTasks accountId={a.id} platform={a.platform} />
      <div className="flex min-w-0 items-center gap-2">
        <SourceBadge source={setup.source} />
        {hasData && <MiniBars values={weeklyGain} className="ml-auto" />}
      </div>
    </div>
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
