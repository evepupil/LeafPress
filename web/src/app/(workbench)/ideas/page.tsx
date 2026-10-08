import { Bookmarks } from "@/features/ideas/bookmarks"
import { DevMaterials } from "@/features/ideas/materials"
import { IdeaBoard } from "@/features/ideas/board"
import { IdeaCapture } from "@/features/ideas/capture"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="灵感">
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <IdeaCapture />
        <IdeaBoard />
        <div className="grid items-start gap-(--gap-card) lg:grid-cols-2">
          <DevMaterials />
          <Bookmarks />
        </div>
      </div>
    </PageFrame>
  )
}
