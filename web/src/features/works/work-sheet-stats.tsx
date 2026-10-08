import { LATEST_DAY } from "@/data/clock"
import type { Work } from "@/data/types"
import { formatDay, formatSigned } from "@/lib/format"
import { metricText, metricsOf, rankedWork } from "@/lib/metrics"
import { SheetSection } from "./work-sheet-parts"

/**
 * 已发布作品的数据：按这个平台自己的数据项一格一格摆（知乎：浏览、点赞、收藏、评论、分享；
 * 博客：访问、访客、评论；B站多了投币、弹幕），再加近 7 天新增的主数据。
 */
export function WorkSheetStats({ work }: { work: Work }) {
  const metrics = metricsOf(work)

  return (
    <SheetSection title="数据" aside={<span className="text-xs text-fg-2">{`截至 ${formatDay(LATEST_DAY)}`}</span>} data-work-stats>
      {work.totals ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.key} data-work-metric={metric.key} className="min-w-0 rounded-md bg-raised px-2.5 py-2">
                <p className="truncate text-xs text-fg-2">{metric.label}</p>
                <p className="truncate text-sm font-medium tabular">{metricText(work, metric.key)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-2 tabular">{`近 7 天${metrics[0].label} ${formatSigned(rankedWork(work).growth)}`}</p>
        </>
      ) : (
        <p className="text-sm text-fg-2">还没有数据，明早 06:00 拉取后显示</p>
      )}
    </SheetSection>
  )
}
