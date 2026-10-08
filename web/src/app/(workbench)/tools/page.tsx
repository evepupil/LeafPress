import { TOOLS } from "@/data/tools"
import { RunList } from "@/features/tools/run-list"
import { ToolGrid } from "@/features/tools/tool-grid"
import { VideoPipeline } from "@/features/tools/video-pipeline"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="工具" meta={<span className="tabular">{TOOLS.length}</span>}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <ToolGrid />
        <div className="grid items-start gap-(--gap-card) xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <RunList />
          </div>
          <div className="min-w-0 xl:col-span-2">
            <VideoPipeline />
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
