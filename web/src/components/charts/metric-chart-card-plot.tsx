import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts"

import { formatCount, type SeriesPoint } from "@leafpress/core"

/**
 * 主图卡里的走势图：面积图（粉丝、阅读、互动）或柱状图（发布）。
 * 对比线是上一个同样长的时间段，浅灰虚线。recharts 只在这个文件里用，颜色全部走 tokens.css 里的变量。
 */

export type PlotKind = "area" | "bar"

/** 坐标轴文字：12px，次要文字色 */
const AXIS_TICK = { fontSize: 12, fill: "var(--text-secondary)" }

/** 悬停提示：这一点的说明、本期的值，对比打开时再加上一期的值 */
function PlotTooltip({ active, payload, compare }: { active?: boolean; payload?: readonly { payload?: SeriesPoint }[]; compare: boolean }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="min-w-40 rounded-lg border border-line bg-card px-2.5 py-2 text-xs shadow-md">
      <div className="pb-1.5 text-fg-2">{point.title}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-0.5 w-3 rounded-full bg-ink" />
        <span className="text-fg-2">本期</span>
        <span className="ml-auto pl-4 font-medium text-fg tabular">{formatCount(point.value)}</span>
      </div>
      {compare && point.compare !== null && (
        <div className="mt-1 flex items-center gap-2">
          <span aria-hidden className="w-3 border-t border-dashed border-(--chart-compare)" />
          <span className="text-fg-2">上一期</span>
          <span className="ml-auto pl-4 text-fg-2 tabular">{formatCount(point.compare)}</span>
        </div>
      )}
    </div>
  )
}

export function MetricPlot({
  points,
  kind,
  compare,
  fillId,
  label,
}: {
  points: SeriesPoint[]
  kind: PlotKind
  compare: boolean
  /** 面积渐变的 id，同一页有多张图时要互不相同 */
  fillId: string
  /** 读屏用的图名 */
  label: string
}) {
  const lastIndex = points.length - 1
  // 几处特意的写法：
  // 1. 图本身只是看的，数字都在页签里：去掉会抢键盘焦点的辅助层，改成「图片」语义加图名。
  // 2. 纵轴宽度写 "auto"，由 recharts 按刻度文字的实际宽度留位置（手写估算会把「2,500」这类标签裁掉）。
  //    它是挂载那一刻量的，网页字体晚到时文字会比量到的略宽，所以允许 SVG 溢出一点，不被边框裁掉。
  // 3. 刻度取 1、2、2.5、5 的整倍数（2,500、5,000、1万）；默认算法会给出 550、850 这类不好读的刻度。
  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      initialDimension={{ width: 800, height: 232 }}
      className="[&_.recharts-surface]:overflow-visible"
    >
      <ComposedChart
        data={points}
        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        role="img"
        aria-label={label}
        accessibilityLayer={false}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-ink)" stopOpacity={0.1} />
            <stop offset="100%" stopColor="var(--chart-ink)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} tick={AXIS_TICK} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width="auto"
          tickMargin={4}
          tickCount={5}
          tick={AXIS_TICK}
          tickFormatter={formatCount}
          allowDecimals={false}
          domain={[0, "auto"]}
          niceTicks="snap125"
        />
        <Tooltip
          isAnimationActive={false}
          cursor={kind === "bar" ? { fill: "var(--state-hover)" } : { stroke: "var(--line-strong)" }}
          content={({ active, payload }) => <PlotTooltip active={active} payload={payload} compare={compare} />}
        />
        {compare && (
          <Line
            type={kind === "bar" ? "linear" : "monotone"}
            dataKey="compare"
            stroke="var(--chart-compare)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        {kind === "bar" ? (
          <>
            <ReferenceLine y={0} stroke="var(--line-strong)" />
            <Bar
              dataKey="value"
              fill="var(--chart-ink)"
              radius={[2, 2, 2, 2]}
              maxBarSize={28}
              isAnimationActive={false}
              // 最后一根是还没走完的这一期，画得淡一点
              shape={(bar: BarShapeProps) => (
                <Rectangle
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  radius={bar.radius}
                  fill="var(--chart-ink)"
                  fillOpacity={bar.index === lastIndex ? 0.55 : 1}
                />
              )}
            />
          </>
        ) : (
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-ink)"
            strokeWidth={1.5}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={{ r: 3, fill: "var(--chart-ink)", stroke: "var(--surface-card)", strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
