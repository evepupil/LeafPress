import { cn } from "cn"
import { Globe } from "lucide-react"
import type { ReactNode } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import type { Benchmark } from "@/data/types"
import { formatDayShort } from "@/lib/format"
import type { DirectionLogItem } from "./direction-draft"

/** 方向档案里的一节：小标题 + 内容 */
export function DirectionSection({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <h3 className="text-xs font-medium text-fg-2">{title}</h3>
      {children}
    </div>
  )
}

/** 列表为空时统一显示这一句 */
export function Unset() {
  return <span className="text-sm text-fg-2">没有设置</span>
}

/** 写给谁、禁用句式：一项一个小标签 */
export function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return <Unset />
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, index) => (
        <LabelChip key={`${index}:${item}`}>{item}</LabelChip>
      ))}
    </div>
  )
}

/** 文风规矩：带序号的短句，长句自然换行 */
export function RuleList({ items }: { items: string[] }) {
  if (items.length === 0) return <Unset />
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm marker:text-fg-2">
      {items.map((item, index) => (
        <li key={`${index}:${item}`} className="break-words">
          {item}
        </li>
      ))}
    </ol>
  )
}

/** 对标：站外的用地球图标，平台上的用平台标识；名字一行，说明一行 */
export function BenchmarkList({ items }: { items: Benchmark[] }) {
  if (items.length === 0) return <span className="text-sm text-fg-2">没有对标账号</span>
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={`${item.platform}:${item.name}`} className="flex min-w-0 items-start gap-2">
          {item.platform === "web" ? (
            <Globe className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
          ) : (
            <PlatformMark platform={item.platform} size={14} className="mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-sm break-words">{item.name}</p>
            <p className="text-xs break-words text-fg-2">{item.note}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** 调整记录：新的在前，左边日期、右边内容 */
export function ChangeLog({ items }: { items: DirectionLogItem[] }) {
  if (items.length === 0) return <Unset />
  return (
    <ul className="flex flex-col gap-1.5" data-direction-log>
      {items.map((item, index) => (
        <li key={`${index}:${item.date}`} className="flex items-baseline gap-2 text-sm">
          <span className="w-16 shrink-0 text-xs text-fg-2 tabular">{formatDayShort(item.date)}</span>
          <span className="min-w-0 break-words">{item.note}</span>
        </li>
      ))}
    </ul>
  )
}
