import { cn } from "cn"
import { LoaderCircle } from "lucide-react"

import { RUN_STATE_LABEL, TOOL_STATUS_LABEL, WORK_STATUS_LABEL } from "@/data/labels"
import type { RunState, StepState, ToolStatus, WorkStatus } from "@/data/types"
import { StatusIcon, type GlyphTone, type StatusGlyph } from "./status-icon"

type Look = { glyph: StatusGlyph; tone: GlyphTone }

const WORK: Record<WorkStatus, Look> = {
  idea: { glyph: "dashed", tone: "idle" },
  writing: { glyph: "half", tone: "progress" },
  ready: { glyph: "dot", tone: "progress" },
  published: { glyph: "check", tone: "done" },
}

const RUN: Record<Exclude<RunState, "running">, Look> = {
  waiting: { glyph: "half", tone: "progress" },
  done: { glyph: "check", tone: "done" },
  failed: { glyph: "alert", tone: "risk" },
}

const STEP: Record<Exclude<StepState, "running">, Look> = {
  done: { glyph: "check", tone: "done" },
  waiting: { glyph: "half", tone: "progress" },
  failed: { glyph: "alert", tone: "risk" },
  pending: { glyph: "ring", tone: "idle" },
}

const STEP_LABEL: Record<StepState, string> = {
  done: "完成",
  running: "运行中",
  waiting: "等待中",
  failed: "失败",
  pending: "未开始",
}

const TOOL: Record<ToolStatus, Look> = {
  ready: { glyph: "check", tone: "team" },
  "needs-setup": { glyph: "alert", tone: "progress" },
  planned: { glyph: "dashed", tone: "idle" },
}

interface IconProps {
  size?: number
  className?: string
}

/** 运行中统一用转圈，这是全站唯一的循环动画 */
function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-3.5 shrink-0 animate-spin text-fg-2", className)} aria-label="运行中" />
}

export function WorkStatusIcon({ status, size, className }: IconProps & { status: WorkStatus }) {
  return <StatusIcon {...WORK[status]} size={size} className={className} label={WORK_STATUS_LABEL[status]} />
}

export function RunStateIcon({ state, size, className }: IconProps & { state: RunState }) {
  if (state === "running") return <Spinner className={className} />
  return <StatusIcon {...RUN[state]} size={size} className={className} label={RUN_STATE_LABEL[state]} />
}

export function StepStateIcon({ state, size, className }: IconProps & { state: StepState }) {
  if (state === "running") return <Spinner className={className} />
  return <StatusIcon {...STEP[state]} size={size} className={className} label={STEP_LABEL[state]} />
}

export function ToolStatusIcon({ status, size, className }: IconProps & { status: ToolStatus }) {
  return <StatusIcon {...TOOL[status]} size={size} className={className} label={TOOL_STATUS_LABEL[status]} />
}
