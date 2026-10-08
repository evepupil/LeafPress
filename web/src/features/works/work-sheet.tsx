"use client"

import { useRef, useState } from "react"

import type { Work } from "@leafpress/core"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useData, useWorks } from "@/state/data"
import { ignoreToastInteraction } from "@/lib/toast"
import { commitFocusedField } from "./work-sheet-actions"
import { WorkSheetBrief } from "./work-sheet-brief"
import { WorkSheetDerived } from "./work-sheet-derived"
import { WorkSheetFields } from "./work-sheet-fields"
import { WorkSheetFolder } from "./work-sheet-folder"
import { WorkSheetHeader } from "./work-sheet-header"
import { WorkSheetLog } from "./work-sheet-log"
import { useCloseWhenMissing } from "./work-sheet-missing"
import { WorkSheetStats } from "./work-sheet-stats"
import { WorkSheetSteps } from "./work-sheet-steps"
import { WorkSheetFeedback, WorkSheetWaiting } from "./work-sheet-waiting"
import { useWorkDetail } from "./use-work-detail"

function WorkSheetBody({ work, onClose, onConvert }: { work: Work; onClose: () => void; onConvert: (work: Work) => void }) {
  const { detail, error, loading } = useWorkDetail(work)
  return (
    <>
      <WorkSheetHeader work={work} detail={detail} detailError={error} detailLoading={loading} onClose={onClose} onConvert={onConvert} />
      {work.status === "doing" && work.error && (
        <p role="alert" data-work-error className="mx-4 mt-3 rounded-md border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">
          出错了：{work.error}
        </p>
      )}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {work.status === "waiting" && <WorkSheetWaiting work={work} detail={detail} />}
        {work.status === "todo" && work.feedback && <WorkSheetFeedback work={work} />}
        <WorkSheetBrief work={work} />
        <WorkSheetFields work={work} />
        {work.status === "done" && <WorkSheetStats work={work} />}
        <WorkSheetSteps work={work} />
        <WorkSheetFolder work={work} detail={detail} loading={loading} error={error} />
        <WorkSheetDerived work={work} />
        <WorkSheetLog work={work} />
        {error && (
          <p role="status" className="px-4 pb-3 text-xs text-warn">
            任务详情加载失败：{error}
          </p>
        )}
      </div>
    </>
  )
}

export function WorkSheet({ workId, onClose, onConvert }: { workId: string | null; onClose: () => void; onConvert: (work: Work) => void }) {
  const works = useWorks()
  const ready = useData((state) => state.status === "ready")
  const work = works.find((item) => item.id === workId)
  useCloseWhenMissing(workId, work !== undefined, ready, onClose)
  const [kept, setKept] = useState(work)
  if (work && work !== kept) setKept(work)
  const shown = work ?? kept
  const opener = useRef<HTMLElement | null>(null)
  return (
    <Sheet
      open={work !== undefined}
      onOpenChange={(open) => {
        if (open) return
        commitFocusedField()
        onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]"
        onInteractOutside={ignoreToastInteraction}
        onOpenAutoFocus={(event) => {
          const active = document.activeElement
          opener.current = active instanceof HTMLElement && active !== document.body ? active : null
          event.preventDefault()
          if (event.target instanceof HTMLElement) event.target.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (opener.current?.isConnected) opener.current.focus()
          opener.current = null
        }}
      >
        {shown && <WorkSheetBody key={shown.id} work={shown} onClose={onClose} onConvert={onConvert} />}
      </SheetContent>
    </Sheet>
  )
}

export default WorkSheet
