"use client"

import { cn } from "cn"
import { ChartColumn } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS, PLATFORMS } from "@/data/accounts"
import { formatCount } from "@/lib/format"
import { metricText, topWorks, type RankBy } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/** 排行只看前 10 名 */
const TOP_LIMIT = 10

const SORT_OPTIONS: { value: RankBy; label: string }[] = [
  { value: "reads", label: "阅读" },
  { value: "interactions", label: "互动" },
  { value: "growth", label: "近 7 天" },
]

const TH = "h-8 px-3 font-normal whitespace-nowrap"
/** 数字列：右对齐、等宽数字 */
const TD_NUM = "px-3 text-right tabular"

/** 作品排行：一个作品一行，可以换排序依据，也可以只看某一个账号 */
export function TopWorks() {
  const [by, setBy] = useState<RankBy>("reads")
  const [account, setAccount] = useState("all")

  const items = useMemo(() => topWorks(by, TOP_LIMIT, account === "all" ? undefined : account), [by, account])

  return (
    <section id="top" aria-labelledby="top-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <ChartColumn className="size-4 text-fg-2" aria-hidden />
        <h2 id="top-title" className="text-sm font-medium">
          作品排行
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <Select value={account} onValueChange={setAccount}>
            <SelectTrigger size="sm" className="h-6 w-auto text-xs" aria-label="账号" data-top-account>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="all">全部账号</SelectItem>
              {ACCOUNTS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {PLATFORMS[item.platform].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div data-top-sort>
            <Segmented<RankBy> label="排序" value={by} onChange={setBy} options={SORT_OPTIONS} />
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={ChartColumn} title="这个号还没有发布数据" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-raised text-xs text-fg-2">
              <tr>
                <th scope="col" className={cn(TH, "text-left")}>
                  #
                </th>
                <th scope="col" className={cn(TH, "text-left")}>
                  作品
                </th>
                <th scope="col" className={cn(TH, "text-left")}>
                  账号
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  阅读
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  赞同
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  收藏
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  评论
                </th>
                <th scope="col" className={cn(TH, "text-right")}>
                  近 7 天
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.work.id}
                  data-top-row
                  data-work={item.work.id}
                  className="h-10 border-t border-line transition-colors duration-(--dur-fast) hover:bg-hover"
                >
                  <td className="w-8 px-3 text-left text-xs text-fg-2 tabular">{index + 1}</td>
                  <td className="px-3">
                    <Link href={`/?open=${item.work.id}`} title={item.work.title} className={cn("block max-w-[320px] truncate", focusRing)}>
                      {item.work.title}
                    </Link>
                  </td>
                  <td className="px-3">
                    <AccountTag account={item.account} />
                  </td>
                  <td className={TD_NUM}>{metricText(item.work, "reads")}</td>
                  <td className={TD_NUM}>{metricText(item.work, "likes")}</td>
                  <td className={TD_NUM}>{metricText(item.work, "collects")}</td>
                  <td className={TD_NUM}>{metricText(item.work, "comments")}</td>
                  <td className={TD_NUM}>{item.growth > 0 ? `+${formatCount(item.growth)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default TopWorks
