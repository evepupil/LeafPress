"use client"

import { formatRelative, type Work } from "@leafpress/core"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { useData } from "@/state/data"
import { LOG_PREVIEW, newestFirst } from "./work-sheet-model"
import { SheetSection } from "./work-sheet-parts"

export function WorkSheetLog({ work }: { work: Work }) {
  const now = useData((state) => state.boot?.now ?? new Date().toISOString())
  const [all, setAll] = useState(false)
  const rows = useMemo(() => newestFirst(work.log), [work.log])
  if (rows.length === 0) return null
  const shown = all ? rows : rows.slice(0, LOG_PREVIEW)
  return (
    <SheetSection title="记录">
      <ul className="flex flex-col gap-2">
        {shown.map(({ entry, index }) => (
          <li key={index} className="flex gap-3 text-xs">
            <span className="w-20 shrink-0 text-fg-2 tabular">{formatRelative(entry.at, now)}</span>
            <span className="min-w-0 flex-1 break-words text-fg">{entry.text}</span>
          </li>
        ))}
      </ul>
      {!all && rows.length > LOG_PREVIEW && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>{`显示全部 ${rows.length} 条`}</Button>
      )}
    </SheetSection>
  )
}
