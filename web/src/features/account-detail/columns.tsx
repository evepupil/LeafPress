import { cn } from "cn"
import { LayoutGrid } from "lucide-react"

import { MiniBars } from "@/components/base/bars"
import { ColorDot } from "@/components/base/marks"
import { formatCount, formatPercent } from "@/lib/format"
import { columnRows } from "@/lib/metrics"

/** 表头：第一列靠左，其余数字列靠右 */
const HEADERS: { label: string; align: "left" | "right" }[] = [
  { label: "栏目", align: "left" },
  { label: "发布", align: "right" },
  { label: "实际 / 计划", align: "right" },
  { label: "平均阅读", align: "right" },
  { label: "互动率", align: "right" },
  { label: "12 周", align: "right" },
]

export function ColumnTable({ accountId }: { accountId: string }) {
  const rows = columnRows(accountId)
  const nothingPublished = rows.every((row) => row.pubs === 0)

  return (
    <section id="columns" aria-labelledby="columns-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <LayoutGrid className="size-4 text-fg-2" aria-hidden />
        <h2 id="columns-title" className="text-sm font-medium">
          栏目表现
        </h2>
        <span className="text-xs text-fg-2">近 12 周</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-raised text-xs text-fg-2">
              {HEADERS.map((header) => (
                <th
                  key={header.label}
                  scope="col"
                  className={cn("h-8 px-3 font-normal whitespace-nowrap", header.align === "left" ? "text-left" : "text-right")}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ column, pubs, share, targetShare, avgReads, interactionRate, weekly }) => (
              <tr key={column.id} data-column-row={column.id} className="h-10 border-t border-line">
                <td className="px-3">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <ColorDot color={column.color} />
                    {column.name}
                  </div>
                </td>
                <td className="px-3 text-right tabular">{pubs}</td>
                <td className="px-3 text-right whitespace-nowrap tabular">
                  {/* 实际占比不到计划的一半，说明这个栏目被冷落了，实际那部分标成警示色 */}
                  <span className={cn(share < targetShare / 2 && "text-warn")}>{formatPercent(share)}</span> / {formatPercent(targetShare)}
                </td>
                <td className="px-3 text-right tabular">{avgReads === null ? "—" : formatCount(avgReads)}</td>
                <td className="px-3 text-right text-fg-2 tabular">{interactionRate === null ? "—" : formatPercent(interactionRate)}</td>
                <td className="px-3">
                  <div className="flex justify-end">
                    <MiniBars values={weekly} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nothingPublished && <p className="border-t border-line px-3 py-2.5 text-sm text-fg-2">近 12 周还没有发布</p>}
    </section>
  )
}

export default ColumnTable
