import { IdeaBoard } from "@/features/ideas/board"
import { IdeaCapture } from "@/features/ideas/capture"
import { IdeaHarvest } from "@/features/ideas/harvest"
import { IdeasMeta } from "@/features/ideas/meta"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="灵感" meta={<IdeasMeta />}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <div className="grid items-start gap-(--gap-card) lg:grid-cols-2">
          <div className="min-w-0">
            <IdeaCapture />
          </div>
          <div className="min-w-0">
            <IdeaHarvest />
          </div>
        </div>
        <IdeaBoard />
      </div>
    </PageFrame>
  )
}
