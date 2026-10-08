"use client"

import { FolderGit2 } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { LabelChip } from "@/components/base/label-chip"
import { Button } from "@/components/ui/button"
import { DEV_MATERIALS } from "@/data/ideas"
import { MATERIAL_KIND_LABEL } from "@/data/labels"
import type { DevMaterial } from "@/data/types"
import { formatDay } from "@/lib/format"
import { useIdeas } from "@/state/ideas"

/** 素材来自几个不同的项目 */
const PROJECT_COUNT = new Set(DEV_MATERIALS.map((material) => material.project)).size

/** 收进灵感时写在「来源补充」里的话：哪个项目的哪类记录 */
function sourceDetailOf(material: DevMaterial): string {
  return `${material.project} · ${MATERIAL_KIND_LABEL[material.kind]}`
}

/** 开发记录里的素材：把进度、评审、提交里值得写的一条收进灵感 */
export function DevMaterials() {
  const ideas = useIdeas((state) => state.ideas)
  const add = useIdeas((state) => state.add)

  // 「已收进」直接看共享灵感里有没有这一条（来源、补充说明、文字都对得上）。
  // 灵感列表离开本页也不会丢，所以回到本页时已收的素材仍然是已收，不会被收第二遍
  function isCollected(material: DevMaterial): boolean {
    const detail = sourceDetailOf(material)
    return ideas.some((idea) => idea.source === "devlog" && idea.sourceDetail === detail && idea.text === material.title)
  }

  function collect(material: DevMaterial) {
    add({ text: material.title, source: "devlog", sourceDetail: sourceDetailOf(material) })
    toast.success("收进灵感了")
  }

  return (
    <section id="materials" aria-labelledby="materials-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <FolderGit2 className="size-4 shrink-0 text-fg-2" aria-hidden />
        <h2 id="materials-title" className="truncate text-sm font-medium">
          开发记录里的素材
        </h2>
        <span className="text-sm text-fg-2 tabular">{DEV_MATERIALS.length}</span>
        <span className="ml-auto shrink-0 text-xs text-fg-2 tabular">来自 {PROJECT_COUNT} 个项目</span>
      </div>

      {DEV_MATERIALS.length === 0 ? (
        <EmptyState icon={FolderGit2} title="最近没有新的开发记录" />
      ) : (
        <ul className="divide-y divide-line">
          {DEV_MATERIALS.map((material) => {
            const collected = isCollected(material)
            return (
              <li key={material.id} data-material={material.id} className="flex min-w-0 gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
                    <LabelChip>{MATERIAL_KIND_LABEL[material.kind]}</LabelChip>
                    <span>{material.project}</span>
                    <span aria-hidden>·</span>
                    <span className="tabular">{formatDay(material.date)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium break-words">{material.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-fg-2">{material.excerpt}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-fg-2">{material.path}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-material-collect
                  disabled={collected}
                  onClick={() => collect(material)}
                  className="self-start"
                >
                  {collected ? "已收进" : "收进灵感"}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default DevMaterials
