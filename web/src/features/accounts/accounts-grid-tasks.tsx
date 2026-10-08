"use client"

import { cn } from "cn"
import Link from "next/link"
import { Fragment, useMemo } from "react"

import { WorkStatusIcon } from "@/components/base/state-icons"
import { WORK_STATUS_LABEL, type PlatformId } from "@leafpress/core"
import { focusRing } from "@/lib/styles"
import { useWorks } from "@/state/data"
import { isIdle, taskCounts, type TaskCounts } from "./accounts-grid-counts"

/** 三组的先后：待实现 · 进行中 · 等你处理 */
const GROUPS: (keyof TaskCounts)[] = ["todo", "doing", "waiting"]

/**
 * 账号卡片里的「手上的活」：这个号的作品里，待实现、进行中、等你处理各有几个，点开去作品页看这个平台的活。
 * 数字读页面上的作品，所以在作品页改了状态，这里立刻跟着变。
 * 整张卡片是靠名字链接铺满来点的，这条链接要高于那一层，所以带 relative z-10；只占内容那么宽，点卡片中间不会误点到它。
 */
export function AccountTasks({ accountId, platform }: { accountId: string; platform: PlatformId }) {
  const works = useWorks()
  const counts = useMemo(() => taskCounts(works, accountId), [works, accountId])

  return (
    <Link
      href={`/?platform=${platform}`}
      data-account-tasks
      className={cn(
        "relative z-10 flex w-fit items-center gap-2 text-xs text-fg-2 transition-colors duration-(--dur-fast) hover:text-fg",
        focusRing,
      )}
    >
      {isIdle(counts)
        ? "手上没有活"
        : GROUPS.map((status, index) => (
            <Fragment key={status}>
              {index > 0 && <span aria-hidden>·</span>}
              {/* 有等你处理的活，这一组用警示色，提醒这个号上有事等你 */}
              <span className={cn("flex items-center gap-1", status === "waiting" && counts.waiting > 0 && "text-warn")}>
                <WorkStatusIcon status={status} />
                {WORK_STATUS_LABEL[status]}
                <span className="tabular">{counts[status]}</span>
              </span>
            </Fragment>
          ))}
    </Link>
  )
}
