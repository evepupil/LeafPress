import { MetricChartCard } from "@/components/charts/metric-chart-card"

/** 数据走势：主图卡按账号取数，页签、时间范围、对比开关都在主图卡里 */
export function AccountTrend({ accountId }: { accountId: string }) {
  return (
    <div id="trend" className="min-w-0">
      <MetricChartCard scope={accountId} />
    </div>
  )
}

export default AccountTrend
