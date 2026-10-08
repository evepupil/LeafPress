"use client"

import { TrendingUp } from "lucide-react"
import { useState } from "react"

import { EmptyState } from "@/components/base/empty-state"
import { Segmented } from "@/components/base/segmented"
import { topPublications } from "@/lib/metrics"
import { MoverRow } from "./movers-row"

type MoverSort = "growth" | "reads"

const SORT_OPTIONS: { value: MoverSort; label: string }[] = [
  { value: "growth", label: "近 7 天" },
  { value: "reads", label: "累计" },
]

/** 榜单只列前几名，看个大概 */
const ROW_COUNT = 6

/**
 * 涨得快的作品：默认按近 7 天新增阅读排，也可以切到按累计阅读排。
 * 表格最窄 560，手机上在卡片里横向滑动，不撑破页面。
 */
export function HomeMovers() {
  const [sort, setSort] = useState<MoverSort>("growth")
  const rows = topPublications(sort, ROW_COUNT)
  // 按近 7 天排时，前几名都没有新增阅读，和完全没有数据一样，说「最近 7 天没有新增阅读」
  const empty = rows.length === 0 || (sort === "growth" && rows.every((item) => item.growth === 0))

  return (
    <section id="movers" aria-labelledby="movers-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <TrendingUp className="size-4 text-fg-2" aria-hidden />
        <h2 id="movers-title" className="text-sm font-medium">
          涨得快的作品
        </h2>
        <div className="ml-auto" data-movers-sort>
          {/* 写明泛型：setState 的参数类型带函数形式，不写的话会被推成 string */}
          <Segmented<MoverSort> label="排序" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>
      </div>
      {empty ? (
        <EmptyState icon={TrendingUp} title="最近 7 天没有新增阅读" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-fg-2">
              <tr>
                <th scope="col" className="h-8 w-8 px-3 text-left font-normal">
                  #
                </th>
                <th scope="col" className="h-8 px-3 text-left font-normal">
                  作品
                </th>
                <th scope="col" className="hidden h-8 px-3 text-left font-normal md:table-cell">
                  账号
                </th>
                <th scope="col" className="h-8 px-3 text-right font-normal">
                  近 7 天
                </th>
                <th scope="col" className="h-8 px-3 text-right font-normal">
                  累计
                </th>
                <th scope="col" className="hidden h-8 px-3 text-right font-normal sm:table-cell">
                  互动率
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <MoverRow key={item.pub.id} item={item} rank={index + 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default HomeMovers
