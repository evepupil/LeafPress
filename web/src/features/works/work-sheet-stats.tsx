import { accountById } from "@/data/accounts"
import { LATEST_DAY } from "@/data/clock"
import type { Work } from "@/data/types"
import { formatDay, formatSigned } from "@/lib/format"
import { metricText, rankedWork } from "@/lib/metrics"
import { SheetSection } from "./work-sheet-parts"

/** 已发布作品的数据：阅读、赞同、收藏、评论四格，加近 7 天新增。这个平台没有的项显示「—」 */
export function WorkSheetStats({ work }: { work: Work }) {
  const cells = [
    ["reads", accountById(work.accountId).readsLabel],
    ["likes", "赞同"],
    ["collects", "收藏"],
    ["comments", "评论"],
  ] as const

  return (
    <SheetSection title="数据" aside={<span className="text-xs text-fg-2">{`截至 ${formatDay(LATEST_DAY)}`}</span>} data-work-stats>
      {work.totals ? (
        <>
          <div className="grid grid-cols-4 gap-2">
            {cells.map(([key, label]) => (
              <div key={key} className="min-w-0 rounded-md bg-raised px-2.5 py-2">
                <p className="truncate text-xs text-fg-2">{label}</p>
                <p className="truncate text-sm font-medium tabular">{metricText(work, key)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-2 tabular">{`近 7 天 ${formatSigned(rankedWork(work).growth)}`}</p>
        </>
      ) : (
        <p className="text-sm text-fg-2">还没有数据，明早 06:00 拉取后显示</p>
      )}
    </SheetSection>
  )
}
