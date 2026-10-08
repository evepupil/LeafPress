"use client"

import { useRef, useState } from "react"

import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { Work } from "@/data/types"
import { ignoreToastInteraction } from "@/lib/toast"
import { useWorks } from "@/state/works"
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

/** 抽屉里的内容：头固定在上面，下面一个可滚动的主体。等你处理 / 你的反馈两块放在主体最上面 */
function WorkSheetBody({ work, onClose, onConvert }: { work: Work; onClose: () => void; onConvert: (work: Work) => void }) {
  return (
    <>
      <WorkSheetHeader work={work} onClose={onClose} onConvert={onConvert} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {work.status === "waiting" && <WorkSheetWaiting work={work} />}
        {work.status === "todo" && work.feedback && <WorkSheetFeedback work={work} />}
        <WorkSheetBrief work={work} />
        <WorkSheetFields work={work} />
        {work.status === "done" && <WorkSheetStats work={work} />}
        <WorkSheetSteps work={work} />
        <WorkSheetFolder work={work} />
        <WorkSheetDerived work={work} />
        <WorkSheetLog work={work} />
      </div>
    </>
  )
}

/**
 * 作品详情抽屉，从右边滑出。一个作品就是一条任务：这里改标题和要求、处理要你做的事、看步骤和记录。
 * workId 为空时关着；找不到这个作品（被删了、编号写错）时也不打开，并通知外面把编号去掉。
 * 抽屉开着时作品会被 AI 一步步改，内容直接读 store，跟着实时变。
 */
export function WorkSheet({ workId, onClose, onConvert }: { workId: string | null; onClose: () => void; onConvert: (work: Work) => void }) {
  const work = useWorks((state) => state.works.find((item) => item.id === workId))
  useCloseWhenMissing(workId, work !== undefined, onClose)

  // 关抽屉（或作品被删）以后内容还要留着，滑出的动画才演得完整
  const [kept, setKept] = useState(work)
  if (work && work !== kept) setKept(work)
  const shown = work ?? kept

  // 记下是从哪里打开的，关掉后焦点回到那里
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
        // 默认会把焦点放到第一个输入框（标题），手机上会直接弹出键盘；改成落在抽屉本身
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
