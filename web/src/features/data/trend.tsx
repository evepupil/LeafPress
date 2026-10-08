"use client"

import { useState } from "react"

import { Segmented } from "@/components/base/segmented"
import { MetricChartCard } from "@/components/charts/metric-chart-card"
import { ACCOUNTS, PLATFORMS } from "@/data/accounts"

/** 账号切换条的选项：全部 + 每个账号（文字用平台名，一叶之桐有三个号，靠平台区分） */
const SCOPE_OPTIONS = [
  { value: "all", label: "全部" },
  ...ACCOUNTS.map((account) => ({ value: account.id, label: PLATFORMS[account.platform].name })),
]

/** 数据页最重要的区块：账号切换条 + 主图卡（指标页签、时间范围、对比都在主图卡里） */
export function DataTrend() {
  const [scope, setScope] = useState("all")

  return (
    <div id="trend" className="flex min-w-0 flex-col gap-2">
      {/* 手机上放不下时横向滚动，隐藏滚动条；两侧留 2px 给焦点描边 */}
      <div className="no-scrollbar -mx-0.5 overflow-x-auto px-0.5" data-trend-scope>
        <Segmented label="看哪个号" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>
      {/* 以账号为 key：换账号时整张卡重新挂载，页签回到「粉丝」，时间范围和对比也回到默认 */}
      <MetricChartCard key={scope} scope={scope} />
    </div>
  )
}

export default DataTrend
