import { THIS_WEEK } from "@/data/clock"
import { formatWeekRange } from "@/lib/format"
import { weekCadence, type CadenceItem } from "@/lib/metrics"
import { CadenceDayCell } from "./cadence-day"

type Kind = CadenceItem["kind"]

const KIND_LABEL: Record<Kind, string> = {
  published: "已发",
  planned: "排期",
  pending: "待回填",
}

const KIND_ORDER: Kind[] = ["published", "planned", "pending"]

/**
 * 本周节奏：把这一周七天里已经发出的、排了期的、等回填链接的版本摆在日历上，
 * 一眼看出哪天有事、哪天是空的。右上角按状态汇总件数。
 */
export function HomeCadence() {
  const days = weekCadence(THIS_WEEK)
  const items = days.flatMap((day) => day.items)
  const summary =
    items.length === 0
      ? "这周还没有安排"
      : KIND_ORDER.map((kind) => `${KIND_LABEL[kind]} ${items.filter((item) => item.kind === kind).length}`).join(" · ")

  return (
    <section id="cadence" aria-labelledby="cadence-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-2">
        <h2 id="cadence-title" className="text-sm font-medium">
          本周节奏
        </h2>
        <span className="text-xs text-fg-2">{formatWeekRange(THIS_WEEK)}</span>
        <span className="ml-auto text-xs text-fg-2 tabular" data-cadence-summary>
          {summary}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-7">
        {days.map((day) => (
          <CadenceDayCell key={day.day} day={day} />
        ))}
      </div>
      {/* 图例的三个小图形和上面三种条目的样子对应。
          条目是白底放在灰色的日期格上，图例里的白色小方块直接放在白卡上就看不见了，所以各垫一层灰底 */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex rounded-[3px] bg-column p-0.5">
            <span className="size-2.5 rounded-[2px] border border-line bg-card shadow-xs" />
          </span>
          {KIND_LABEL.published}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex rounded-[3px] bg-column p-0.5">
            <span className="size-2.5 rounded-[2px] border border-dashed border-line-3 bg-card" />
          </span>
          {KIND_LABEL.planned}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="mx-0.5 size-1.5 rounded-full" style={{ background: "var(--label-amber)" }} />
          {KIND_LABEL.pending}
        </span>
      </div>
    </section>
  )
}

export default HomeCadence
