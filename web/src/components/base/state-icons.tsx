import { cn } from "cn"
import { LoaderCircle } from "lucide-react"

import { WORK_STATUS_LABEL, type WorkStatus } from "@leafpress/core"
import type { StepState } from "@leafpress/core"
import { StatusIcon, type GlyphTone, type StatusGlyph } from "./status-icon"

type Look = { glyph: StatusGlyph; tone: GlyphTone }

/** 作品四种状态：待实现空心圈、进行中半圆、等你处理实心黄点、已完成对勾 */
const WORK: Record<WorkStatus, Look> = {
  todo: { glyph: "ring", tone: "idle" },
  doing: { glyph: "half", tone: "progress" },
  waiting: { glyph: "dot", tone: "progress" },
  done: { glyph: "check", tone: "done" },
}

const STEP: Record<Exclude<StepState, "running">, Look> = {
  done: { glyph: "check", tone: "done" },
  waiting: { glyph: "dot", tone: "progress" },
  pending: { glyph: "ring", tone: "idle" },
}

const STEP_LABEL: Record<StepState, string> = {
  done: "完成",
  running: "进行中",
  waiting: "等你处理",
  pending: "未开始",
}

type WorkflowStatus = "ready" | "needs-setup"

const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = { ready: "可用", "needs-setup": "待配置" }

const WORKFLOW: Record<WorkflowStatus, Look> = {
  ready: { glyph: "check", tone: "team" },
  "needs-setup": { glyph: "alert", tone: "progress" },
}

const RESULT: Record<"ok" | "failed", Look> = {
  ok: { glyph: "check", tone: "team" },
  failed: { glyph: "alert", tone: "risk" },
}

interface IconProps {
  size?: number
  className?: string
}

/** AI 正在做统一用转圈，这是全站唯一的循环动画 */
export function Spinner({ className, label = "进行中" }: { className?: string; label?: string }) {
  return <LoaderCircle className={cn("size-3.5 shrink-0 animate-spin text-fg-2", className)} aria-label={label} />
}

export function WorkStatusIcon({ status, size, className }: IconProps & { status: WorkStatus }) {
  return <StatusIcon {...WORK[status]} size={size} className={className} label={WORK_STATUS_LABEL[status]} />
}

export function StepStateIcon({ state, size, className }: IconProps & { state: StepState }) {
  if (state === "running") return <Spinner className={className} />
  return <StatusIcon {...STEP[state]} size={size} className={className} label={STEP_LABEL[state]} />
}

export function WorkflowStatusIcon({ status, size, className }: IconProps & { status: WorkflowStatus }) {
  return <StatusIcon {...WORKFLOW[status]} size={size} className={className} label={WORKFLOW_STATUS_LABEL[status]} />
}

/** 定时工作流最近一次运行的结果 */
export function RunResultIcon({ result, size, className }: IconProps & { result: "ok" | "failed" }) {
  return <StatusIcon {...RESULT[result]} size={size} className={className} label={result === "ok" ? "成功" : "失败"} />
}
