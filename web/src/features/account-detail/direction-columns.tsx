import { ColorDot } from "@/components/base/marks"
import { ProgressMeter } from "@/components/base/progress-meter"
import { formatPercent } from "@/lib/format"
import type { ColumnRow } from "@/lib/metrics"
import { Unset } from "./direction-parts"

/**
 * 栏目：计划占比和近 12 周的实际占比放在一行，只读（编辑方向时也照常显示）。
 * 「近 12 周没发过」放在行尾。宽屏上只要有一个栏目带这句，所有栏目都给它留出同样宽的位置，
 * 占比文字和进度条才能上下对齐；手机上它单独占一行、缩进到栏目名下面，栏目名不会被挤成一个字。
 */
export function ColumnPlan({ rows }: { rows: ColumnRow[] }) {
  if (rows.length === 0) return <Unset />
  const anyIdle = rows.some((row) => row.works === 0)
  return (
    <ul className="flex flex-col gap-1">
      {rows.map(({ column, works, share, targetShare }) => (
        <li key={column.id} data-direction-column={column.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <ColorDot color={column.color} />
          <span className="min-w-24 flex-1 truncate">{column.name}</span>
          <span className="text-xs text-fg-2 tabular">
            计划 {formatPercent(targetShare)} · 实际 {formatPercent(share)}
          </span>
          <ProgressMeter value={share} className="w-16" />
          {works === 0 ? (
            <span className="text-xs text-warn max-sm:basis-full max-sm:pl-4 sm:w-24 sm:text-right">近 12 周没发过</span>
          ) : (
            anyIdle && <span aria-hidden className="hidden sm:block sm:w-24" />
          )}
        </li>
      ))}
    </ul>
  )
}
