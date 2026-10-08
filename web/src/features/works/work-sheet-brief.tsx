"use client"

import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateWork } from "@/state/actions/works"
import type { Work } from "@leafpress/core"
import { useDraft } from "./work-sheet-draft"
import { SheetSection } from "./work-sheet-parts"

export function WorkSheetBrief({ work }: { work: Work }) {
  const [brief, setBrief] = useDraft(work.brief)
  const [question, setQuestion] = useDraft(work.question ?? "")
  const saveBrief = () => {
    if (brief !== work.brief)
      void updateWork(work.id, { brief }).catch((error: unknown) => toast(error instanceof Error ? error.message : "更新要求失败"))
  }
  return (
    <SheetSection title="要求" labelFor="work-brief">
      <Textarea
        id="work-brief"
        rows={4}
        placeholder="写下任务要求"
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        onBlur={saveBrief}
      />
      {work.question != null && (
        <Input
          id="work-question"
          aria-label="挂的问题"
          placeholder="挂在哪个问题下"
          className="mt-2"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onBlur={() => {
            const next = question.trim()
            if (next !== (work.question ?? ""))
              void updateWork(work.id, { question: next || null }).catch((error: unknown) =>
                toast(error instanceof Error ? error.message : "更新问题失败"),
              )
            setQuestion(next)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur()
          }}
        />
      )}
    </SheetSection>
  )
}
