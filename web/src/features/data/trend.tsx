"use client"

import { PLATFORMS } from "@leafpress/core"
import { useMemo, useState } from "react"

import { Segmented } from "@/components/base/segmented"
import { MetricChartCard } from "@/components/charts/metric-chart-card"
import { useAccounts } from "@/state/data"

export function DataTrend() {
  const accounts = useAccounts()
  const [selected, setSelected] = useState("all")
  const scope = accounts.some((account) => account.id === selected) ? selected : "all"
  const options = useMemo(
    () => [
      { value: "all", label: "全部" },
      ...accounts.map((account) => ({ value: account.id, label: `${account.name} · ${PLATFORMS[account.platform].name}` })),
    ],
    [accounts],
  )

  return (
    <div id="trend" className="flex min-w-0 flex-col gap-2">
      <div className="no-scrollbar -mx-0.5 overflow-x-auto px-0.5" data-trend-scope>
        <Segmented label="看哪个号" value={scope} onChange={setSelected} options={options} />
      </div>
      <MetricChartCard key={scope} scope={scope} />
    </div>
  )
}

export default DataTrend
