"use client"

import { cn } from "cn"
import { ChartLine } from "lucide-react"
import { useMemo, useState } from "react"

import { Delta } from "@/components/base/delta"
import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  METRIC_LABEL,
  PLATFORMS,
  combinedSecondary,
  formatCount,
  metricSeries,
  secondaryOf,
  type MetricId,
  type MetricResult,
  type MetricsInput,
  type RangeId,
} from "@leafpress/core"
import { focusRingInset } from "@/lib/styles"
import { useMetricsInput } from "@/state/data"
import { MetricPlot, type PlotKind } from "./metric-chart-card-plot"

/**
 * 主图卡：四个指标做成图表的切换页签，不单独做统计卡。
 * scope 传 "all"（全部账号）或一个账号编号；数据都来自 metricSeries。
 * 选中的账号都拿不到粉丝数时（博客的 Umami 不给订阅数）没有「粉丝」这一页，默认选中后面的第一页。
 */

/** 页签顺序固定 */
const METRICS: MetricId[] = ["followers", "reads", "interactions", "posts"]

/** 发布数是一格一格的计数，用柱状图；其余是连续的走势，用面积图 */
const PLOT_KIND: Record<MetricId, PlotKind> = {
  followers: "area",
  reads: "area",
  interactions: "area",
  posts: "bar",
}

const RANGE_OPTIONS: { value: RangeId; label: string }[] = [
  { value: "4w", label: "近 4 周" },
  { value: "12w", label: "近 12 周" },
]

const RANGE_NOTE: Record<RangeId, string> = {
  "4w": "近 4 周，按天",
  "12w": "近 12 周，按周",
}

/**
 * 页签名：全部账号用统一叫法；单个账号的「粉丝」「阅读」按平台的说法（关注者、订阅、播放……）。
 * 第二个数（interactions）按平台叫：知乎是互动、博客是访客；几个账号合在一起看时访客和互动
 * 不能相加，共享规则只合计互动类账号，页签名跟着合计的口径走（只看博客时叫「访客」）。
 */
function tabLabel(scope: string, metric: MetricId, input: MetricsInput): string {
  if (scope === "all") {
    return metric === "interactions"
      ? combinedSecondary(input.accounts.map((item) => PLATFORMS[item.platform])).label
      : METRIC_LABEL[metric]
  }
  const account = input.accounts.find((item) => item.id === scope)
  if (!account) return METRIC_LABEL[metric]
  if (metric === "followers") return PLATFORMS[account.platform].audienceLabel
  if (metric === "reads") return PLATFORMS[account.platform].metrics[0]?.label ?? METRIC_LABEL.reads
  if (metric === "interactions") return secondaryOf(PLATFORMS[account.platform]).label
  return METRIC_LABEL[metric]
}

interface TabData {
  id: MetricId
  label: string
  result: MetricResult
}

function MetricTab({
  scope,
  tab,
  selected,
  index,
  count,
  onSelect,
}: {
  scope: string
  tab: TabData
  selected: boolean
  index: number
  /** 一共几页：有的账号没有「粉丝」这一页，只剩三页 */
  count: number
  onSelect(): void
}) {
  // 手机两列：左列画右边线，三页时落单的最后一页横跨两列、不画右边线；桌面一行排开：除最后一页都画右边线
  const alone = index === count - 1 && count % 2 === 1
  return (
    <button
      type="button"
      role="tab"
      id={`metric-tab-${scope}-${tab.id}`}
      aria-selected={selected}
      aria-controls={`metric-panel-${scope}`}
      data-metric-tab={tab.id}
      onClick={onSelect}
      className={cn(
        "relative flex min-w-0 flex-col items-stretch gap-1 border-b border-line px-3 pt-2.5 pb-2 text-left transition-colors duration-(--dur-fast)",
        focusRingInset,
        index % 2 === 0 && !alone && "border-r",
        alone && "col-span-2 sm:col-span-1",
        index < count - 1 && "sm:border-r",
        // 选中的页签和下面的图连成一片：底色同图、桌面上去掉底边线
        selected ? "bg-card sm:border-b-transparent" : "bg-raised hover:bg-column",
      )}
    >
      <span
        aria-hidden
        className={cn("absolute top-3 left-0 h-3 w-0.5 rounded-r-full transition-colors", selected ? "bg-ink" : "bg-transparent")}
      />
      <span className="flex min-w-0 items-center justify-between gap-2 text-xs text-fg-2">
        <span className="truncate">{tab.label}</span>
        <Delta value={tab.result.change} className="shrink-0" />
      </span>
      <span data-metric-value={tab.id} className="truncate text-xl font-medium text-fg tabular">
        {tab.result.value === null ? "—" : formatCount(tab.result.value)}
      </span>
    </button>
  )
}

export function MetricChartCard({ scope, className }: { scope: string; className?: string }) {
  const [metric, setMetric] = useState<MetricId>("followers")
  const [range, setRange] = useState<RangeId>("12w")
  const [compare, setCompare] = useState(true)
  const input = useMetricsInput()

  // 页签的名字和数据一起算好；只有账号或时间范围变了才重算，切页签、开关对比都不会重算。
  // 这一项选中的账号都拿不到（available 为 false）就不给页签
  const tabs = useMemo<TabData[]>(
    () =>
      input
        ? METRICS.map((id) => ({ id, label: tabLabel(scope, id, input), result: metricSeries(input, scope, id, range) })).filter(
            (tab) => tab.result.available,
          )
        : [],
    [scope, range, input],
  )
  // 选的页签不在了（粉丝拿不到）就退到第一页
  const current = tabs.find((tab) => tab.id === metric) ?? tabs[0]
  if (!current) return <EmptyState icon={ChartLine} title="正在读取数据" className={className} />
  // 本期和上一期每个点都是 0, 才算没数据；只有上一期有数时仍然画图，让人看到是本期掉到了 0
  const hasData = current.result.points.some(
    (point) => (point.value !== null && point.value !== 0) || (point.compare !== null && point.compare !== 0),
  )
  const compareId = `compare-${scope}`

  return (
    <section aria-label="数据走势" className={cn("overflow-hidden rounded-lg border border-line bg-card shadow-sm", className)}>
      <div role="tablist" aria-label="指标" className={cn("grid grid-cols-2", tabs.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4")}>
        {tabs.map((tab, index) => (
          <MetricTab
            key={tab.id}
            scope={scope}
            tab={tab}
            index={index}
            count={tabs.length}
            selected={tab.id === current.id}
            onSelect={() => setMetric(tab.id)}
          />
        ))}
      </div>
      <div role="tabpanel" id={`metric-panel-${scope}`} aria-labelledby={`metric-tab-${scope}-${current.id}`} className="pb-2">
        <div className="flex h-7 items-center gap-2 px-3 pt-2 text-xs text-fg-2">
          <span className="min-w-0 truncate">{RANGE_NOTE[range]}</span>
          <div className="ml-auto flex shrink-0 items-center gap-4">
            <div data-range-switch className="flex">
              <Segmented<RangeId> value={range} options={RANGE_OPTIONS} onChange={setRange} label="时间范围" />
            </div>
            <div className="flex items-center gap-1.5">
              <Switch id={compareId} size="sm" checked={compare} onCheckedChange={setCompare} />
              <Label htmlFor={compareId}>对比上一期</Label>
            </div>
          </div>
        </div>
        <div className="mt-2 h-[200px] px-3 sm:h-[232px]">
          {hasData ? (
            <MetricPlot
              points={current.result.points}
              kind={PLOT_KIND[current.id]}
              compare={compare}
              fillId={`metric-fill-${scope}`}
              label={`${current.label}走势图，${RANGE_NOTE[range]}`}
            />
          ) : (
            <EmptyState icon={ChartLine} title="还没有数据" className="h-full" />
          )}
        </div>
      </div>
    </section>
  )
}

export default MetricChartCard
