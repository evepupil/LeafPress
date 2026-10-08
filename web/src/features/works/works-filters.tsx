"use client"

import { Search, X } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import { LabelChip } from "@/components/base/label-chip"
import { Segmented } from "@/components/base/segmented"
import { Input } from "@/components/ui/input"
import { PLATFORMS } from "@/data/accounts"
import { WORK_STATUS_LABEL } from "@/data/labels"
import type { WorkStatus } from "@/data/types"
import { FilterBar } from "@/features/shell/page-frame"
import { PLATFORM_IDS, type PlatformFilter } from "./works-model"

/**
 * 筛选栏：平台（后面的数字是按搜索词筛过的个数）、搜索框、侧栏视图带来的「只看」条件。
 * 搜索词只在本页里，不进地址栏。
 */
export function WorksFilterBar({
  platform,
  counts,
  query,
  status,
  onPlatformChange,
  onQueryChange,
  onClearStatus,
}: {
  platform: PlatformFilter
  counts: Record<PlatformFilter, number>
  query: string
  status: WorkStatus | null
  onPlatformChange: (platform: PlatformFilter) => void
  onQueryChange: (query: string) => void
  onClearStatus: () => void
}) {
  const options: { value: PlatformFilter; label: string }[] = [
    { value: "all", label: `全部 ${counts.all}` },
    ...PLATFORM_IDS.map((id) => ({ value: id, label: `${PLATFORMS[id].name} ${counts[id]}` })),
  ]

  return (
    <FilterBar
      left={
        <>
          <div data-works-platform className="shrink-0">
            <Segmented<PlatformFilter> label="平台" value={platform} options={options} onChange={onPlatformChange} />
          </div>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input
              data-works-search
              aria-label="搜标题、要求、编号"
              placeholder="搜标题、要求、编号"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="h-6 w-44 pl-7 text-xs md:text-xs"
            />
          </div>
          {status && (
            <>
              <span data-works-status-chip className="inline-flex min-w-0 shrink-0">
                <LabelChip>只看：{WORK_STATUS_LABEL[status]}</LabelChip>
              </span>
              <IconButton label="看全部" size="icon-xs" onClick={onClearStatus}>
                <X />
              </IconButton>
            </>
          )}
        </>
      }
    />
  )
}
