"use client"

import { derivedFrom, type Work } from "@leafpress/core"
import { useMemo } from "react"

import { WorkChip } from "@/components/base/work-chip"
import { useWorks } from "@/state/data"
import { SheetSection } from "./work-sheet-parts"

export function WorkSheetDerived({ work }: { work: Work }) {
  const works = useWorks()
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
