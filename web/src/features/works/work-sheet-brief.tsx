"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Work } from "@/data/types"
import { useWorks } from "@/state/works"
import { useDraft } from "./work-sheet-draft"
import { SheetSection } from "./work-sheet-parts"

/** 写给 AI 的要求。挂问题的回答（博客转知乎回答）下面多一个问题输入框 */
export function WorkSheetBrief({ work }: { work: Work }) {
  const update = useWorks((state) => state.update)
  const [brief, setBrief] = useDraft(work.brief)
  const [question, setQuestion] = useDraft(work.question ?? "")

  return (
    <SheetSection title="要求" labelFor="work-brief">
      <Textarea
        id="work-brief"
        rows={4}
        placeholder="写给 AI 的要求"
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        onBlur={() => {
          if (brief !== work.brief) update(work.id, { brief })
        }}
      />
      {work.workflowId === "blog-to-zhihu-answer" && (
        <Input
          id="work-question"
          aria-label="挂的问题"
          placeholder="挂在哪个问题下"
          className="mt-2"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onBlur={() => {
            const next = question.trim()
            if (next !== (work.question ?? "")) update(work.id, { question: next })
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
