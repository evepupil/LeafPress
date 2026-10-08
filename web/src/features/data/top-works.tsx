"use client"

import { cn } from "cn"
import { ChartColumn } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { formatCount } from "@/lib/format"
import { metricText, topWorks, type RankBy } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/** 排行只看前 10 名 */
const TOP_LIMIT = 10

const SORT_OPTIONS: { value: RankBy; label: string }[] = [
  { value: "reach", label: "浏览" },
  { value: "interactions", label: "互动" },
  { value: "growth", label: "近 7 天" },
]

const TH = "h-8 px-3 font-normal whitespace-nowrap"
/** 数字列：右对齐、等宽数字 */
const TD_NUM = "px-3 text-right tabular"

/**
 * 作品排行：一个作品一行，可以换排序依据，也可以只看某一个账号。
 * 各平台的数据项不一样：看全部账号时列主数据（浏览 / 访问 / 播放，各取各的）和互动合计；
 * 只看一个号时按这个平台自己的数据项一列一列摆（知乎：浏览、点赞、收藏、评论、分享）。
 */
export function TopWorks() {
  const [by, setBy] = useState<RankBy>("reach")
  const [account, setAccount] = useState("all")

  const items = useMemo(() => topWorks(by, TOP_LIMIT, account === "all" ? undefined : account), [by, account])
  const metrics = account === "all" ? null : PLATFORMS[accountById(account).platform].metrics

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
        <EmptyState icon={ChartColumn} title="这个号还没有数据" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-raised text-xs text-fg-2">
              <tr>
                <th scope="col" className={cn(TH, "text-left")}>
                  #
                </th>
                <th scope="col" className={cn(TH, "text-left")}>
                  作品
                </th>
                {metrics ? (
                  metrics.map((metric) => (
                    <th key={metric.key} scope="col" className={cn(TH, "text-right")}>
                      {metric.label}
                    </th>
                  ))
                ) : (
                  <>
                    <th scope="col" className={cn(TH, "text-left")}>
                      账号
                    </th>
                    <th scope="col" className={cn(TH, "text-right")}>
                      浏览
                    </th>
                    <th scope="col" className={cn(TH, "text-right")}>
                      互动
                    </th>
                  </>
                )}
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
                  {metrics ? (
                    metrics.map((metric) => (
                      <td key={metric.key} className={TD_NUM}>
                        {metricText(item.work, metric.key)}
                      </td>
                    ))
                  ) : (
                    <>
                      <td className="px-3">
                        <AccountTag account={item.account} />
                      </td>
                      <td className={TD_NUM} title={item.account.readsLabel}>
                        {formatCount(item.reach)}
                      </td>
                      <td className={TD_NUM}>{formatCount(item.interactions)}</td>
                    </>
                  )}
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
