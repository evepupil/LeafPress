"use client"

import { useMemo } from "react"

import { WorkChip } from "@/components/base/work-chip"
import type { Work } from "@/data/types"
import { derivedFrom } from "@/lib/board"
import { useWorks } from "@/state/works"
import { SheetSection } from "./work-sheet-parts"

/** 由这个作品转出去的作品（例如这篇博客转成的知乎文章）。点一个就在抽屉里切过去 */
export function WorkSheetDerived({ work }: { work: Work }) {
  const works = useWorks((state) => state.works)
  const derived = useMemo(() => derivedFrom(works, work.id), [works, work.id])
  if (derived.length === 0) return null

  return (
    <SheetSection title="转出去的作品" titleExtra={<span className="text-xs text-fg-2 tabular">{derived.length}</span>}>
      <div className="flex flex-wrap gap-1">
        {derived.map((item) => (
          <WorkChip key={item.id} work={item} />
        ))}
      </div>
    </SheetSection>
  )
}
