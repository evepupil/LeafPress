import { cn } from "cn"

import type { CadenceDay } from "@/lib/metrics"
import { CadenceEntry } from "./cadence-item"

type DayKind = "today" | "other"

/** 今天的底色深一档，其余天是普通的分组底色 */
const DAY_BG: Record<DayKind, string> = {
  today: "bg-selected",
  other: "bg-column",
}

/** 今天的星期用深色加粗，其余天用次要色 */
const WEEKDAY_STYLE: Record<DayKind, string> = {
  today: "text-xs font-medium text-fg",
  other: "text-xs text-fg-2",
}

/**
 * 本周节奏里的一天。手机上一天一行：日期头在左，条目在右，放不下就换行；
 * 桌面上七天并排，日期头在上，条目竖着排。没有条目的天只留日期头。
 * 手机上日期头宽度固定，且不许折行：周末的「周六 10/10」比工作日长，
 * 宽度留 64px，才不会贴到右边的条目。
 */
export function CadenceDayCell({ day }: { day: CadenceDay }) {
  const kind: DayKind = day.isToday ? "today" : "other"
  return (
    <div
      data-cadence-day={day.day}
      aria-current={day.isToday ? "date" : undefined}
      className={cn("flex min-w-0 gap-2 rounded-md p-1.5 md:min-h-24 md:flex-col md:gap-1", DAY_BG[kind])}
    >
      <div className="flex w-16 shrink-0 items-baseline gap-1 whitespace-nowrap md:w-auto">
        <span className={WEEKDAY_STYLE[kind]}>{day.isToday ? "今天" : day.weekday}</span>
        <span className="text-xs text-fg-2 tabular">{day.date}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1 md:flex-col md:flex-nowrap">
        {day.items.map((item) => (
          <CadenceEntry key={item.pub.id} item={item} />
        ))}
      </div>
    </div>
  )
}
