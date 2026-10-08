import { Captions, Clapperboard, MonitorPlay, Smartphone } from "lucide-react"
import Link from "next/link"

import { LabelChip } from "@/components/base/label-chip"
import { ProgressMeter } from "@/components/base/progress-meter"
import { RunStateIcon, StepStateIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { RUN_STATE_LABEL } from "@/data/labels"
import { RUNS } from "@/data/tools"
import type { ToolRun } from "@/data/types"
import { stepCounts } from "./run-list-model"

/** 流水线展示的是哪一次运行 */
const VIDEO_RUN_ID = "run-02"

/** 七个阶段和各自用的工具；阶段名要和运行记录里的步骤名一致，状态和备注靠它对上 */
const STAGES = [
  { name: "录屏", tool: "OBS 或 Cap" },
  { name: "剪掉没说话的片段", tool: "auto-editor" },
  { name: "生成字幕", tool: "VideoCaptioner + faster-whisper" },
  { name: "你校对字幕", tool: "人工" },
  { name: "配音（可选）", tool: "IndexTTS-2.5，只有 CPU 时用 edge-tts" },
  { name: "出横版和竖版", tool: "FFmpeg" },
  { name: "投稿", tool: "biliup（还没登录）" },
]

/** 这次运行现在卡在哪：在等人就说等什么，否则说运行状态 */
function statusText(run: ToolRun): string {
  const waiting = run.steps.find((step) => step.state === "waiting")
  return run.state === "waiting" && waiting ? `等${waiting.name}` : RUN_STATE_LABEL[run.state]
}

/** 录屏成片：不用 AI 视频模型，一份录屏经过七个阶段出横版和竖版 */
export function VideoPipeline() {
  const run = RUNS.find((item) => item.id === VIDEO_RUN_ID)
  const counts = run ? stepCounts(run) : null
  // 找不到这次运行时，七个阶段都按未开始显示
  const stages = STAGES.map((stage) => ({ ...stage, step: run?.steps.find((step) => step.name === stage.name) }))

  return (
    <section id="video" aria-labelledby="video-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Clapperboard className="size-4 text-fg-2" aria-hidden />
        <h2 id="video-title" className="text-sm font-medium">
          录屏成片
        </h2>
        <LabelChip>不用 AI 视频模型</LabelChip>
      </div>

      {run && counts ? (
        <div className="rounded-md bg-raised px-3 py-2.5" data-video-current>
          <div className="flex items-center gap-2">
            <RunStateIcon state={run.state} />
            <span className="min-w-0 flex-1 truncate text-sm">{run.title}</span>
            <span className="text-xs text-fg-2 tabular">
              {counts.done}/{counts.total}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <ProgressMeter value={counts.total > 0 ? counts.done / counts.total : 0} className="w-24" />
            <span className="text-xs text-fg-2">{statusText(run)}</span>
            {run.state === "waiting" && (
              <Button variant="outline" size="sm" className="ml-auto" asChild>
                <Link href={`/tools/?run=${run.id}`}>去校对</Link>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-2">现在没有在做的视频</p>
      )}

      <ol className="mt-3 flex flex-col">
        {stages.map(({ name, tool, step }) => (
          <li key={name} data-video-stage className="flex gap-2.5 py-1.5">
            <StepStateIcon state={step?.state ?? "pending"} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{name}</p>
              <p className="text-xs text-fg-2">
                {tool}
                {step?.note ? ` · ${step.note}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2.5">
        <LabelChip icon={<MonitorPlay className="size-3 text-fg-3" aria-hidden />}>横版 16:9 → B站</LabelChip>
        <LabelChip icon={<Smartphone className="size-3 text-fg-3" aria-hidden />}>竖版 9:16 → 小红书、抖音</LabelChip>
        <LabelChip icon={<Captions className="size-3 text-fg-3" aria-hidden />}>字幕 .srt</LabelChip>
      </div>
    </section>
  )
}

export default VideoPipeline
