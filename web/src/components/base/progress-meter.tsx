import { cn } from "cn"

/** 细进度条：深色填充在浅灰轨道上，value 取 0～1，超出截断 */
export function ProgressMeter({ value, className, title }: { value: number; className?: string; title?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  return (
    <span
      title={title}
      aria-hidden
      className={cn("relative inline-block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-pressed", className)}
    >
      <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${pct}%` }} />
    </span>
  )
}
