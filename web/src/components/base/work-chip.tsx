import { cn } from "cn"
import Link from "next/link"

import { PLATFORMS, accountById } from "@/data/accounts"
import { WORK_STATUS_LABEL } from "@/data/labels"
import type { Work } from "@/data/types"
import { focusRing } from "@/lib/styles"
import { PlatformMark } from "./marks"
import { WorkStatusIcon } from "./state-icons"

/**
 * 作品小标签：平台标识 + 平台名 + 状态图形，点了打开作品详情（/?open=编号）。
 * 灵感卡片上列出转出去的作品、作品详情里列出由它转出去的作品，都用它。
 */
export function WorkChip({ work, className }: { work: Work; className?: string }) {
  const platform = PLATFORMS[accountById(work.accountId).platform]
  return (
    <Link
      href={`/?open=${work.id}`}
      data-work-chip={work.id}
      title={`${work.title} · ${platform.name} · ${WORK_STATUS_LABEL[work.status]}`}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded-md border border-line-2 bg-card pr-1.5 pl-1 text-xs text-fg-2 transition-colors duration-(--dur-fast) hover:border-line-3 hover:text-fg",
        focusRing,
        className,
      )}
    >
      <PlatformMark platform={platform.id} size={12} />
      <span className="truncate">{platform.name}</span>
      <WorkStatusIcon status={work.status} size={12} />
    </Link>
  )
}
