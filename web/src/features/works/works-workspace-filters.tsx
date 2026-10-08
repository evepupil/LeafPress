"use client"

import { cn } from "cn"
import { Search } from "lucide-react"

import { StatusIcon } from "@/components/base/status-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { WORK_STATUS_LABEL, WORK_STATUS_ORDER } from "@/data/labels"
import { FilterBar } from "@/features/shell/page-frame"
import { focusRing } from "@/lib/styles"
import { hasActiveFilters, type WorksFilters } from "./works-workspace-model"
import { AccountOptionContent } from "./works-workspace-parts"

/** 「只看待发」开关的外观：按下和未按下各一套完整类名 */
const PENDING_BUTTON = {
  base: "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors duration-(--dur-fast)",
  on: "border-line-3 bg-selected text-fg",
  off: "border-line-2 bg-card text-fg-2 hover:text-fg",
} as const

/** 下拉触发器：和视图栏的小控件同高，窄屏下不压缩（整条筛选栏横向滚动） */
const SELECT_TRIGGER = "h-6 w-auto shrink-0 gap-1 text-xs"

/** 筛选栏：搜标题、账号、平台、状态、只看待发；有任何筛选生效时右边出现「清除筛选」 */
export function WorksFilterBar({
  filters,
  onChange,
  onReset,
}: {
  filters: WorksFilters
  onChange(patch: Partial<WorksFilters>): void
  onReset(): void
}) {
  return (
    <FilterBar
      left={
        <>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
            <Input
              data-works-search
              aria-label="搜标题"
              placeholder="搜标题"
              autoComplete="off"
              value={filters.query}
              onChange={(event) => onChange({ query: event.target.value })}
              className="h-6 w-44 pl-7 text-xs md:text-xs"
            />
          </div>
          <Select value={filters.account} onValueChange={(account) => onChange({ account })}>
            <SelectTrigger size="sm" data-works-account aria-label="账号" className={SELECT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">全部账号</SelectItem>
              {ACCOUNTS.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <AccountOptionContent account={account} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.platform} onValueChange={(platform) => onChange({ platform: platform as WorksFilters["platform"] })}>
            <SelectTrigger size="sm" data-works-platform aria-label="平台" className={SELECT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">全部平台</SelectItem>
              {Object.values(PLATFORMS).map((platform) => (
                <SelectItem key={platform.id} value={platform.id}>
                  {platform.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(status) => onChange({ status: status as WorksFilters["status"] })}>
            <SelectTrigger size="sm" data-works-status aria-label="状态" className={SELECT_TRIGGER}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">全部状态</SelectItem>
              {WORK_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {WORK_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-pressed={filters.pendingOnly}
            data-works-pending
            onClick={() => onChange({ pendingOnly: !filters.pendingOnly })}
            className={cn(PENDING_BUTTON.base, focusRing, filters.pendingOnly ? PENDING_BUTTON.on : PENDING_BUTTON.off)}
          >
            <StatusIcon glyph="dot" tone="progress" size={12} />
            只看待发
          </button>
        </>
      }
      right={
        hasActiveFilters(filters) ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            清除筛选
          </Button>
        ) : undefined
      }
    />
  )
}
