"use client"

import { NotebookPen } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { DayKey, WeeklyNote } from "@/data/types"
import { weekReport } from "@/lib/report"
import { useReportWeek } from "@/state/report-week"

/** 复盘的三段话 */
interface NoteText {
  wins: string
  improve: string
  next: string
}

/** 按周存放的复盘；没碰过的周没有记录 */
type NotesByWeek = Partial<Record<DayKey, NoteText>>

const FIELDS: { key: keyof NoteText; id: string; label: string }[] = [
  { key: "wins", id: "notes-wins", label: "做得好的" },
  { key: "improve", id: "notes-improve", label: "要改的" },
  { key: "next", id: "notes-next", label: "下周做什么" },
]

/** 这一周原本就有的复盘；没有就是三个空串 */
function textOf(note: WeeklyNote | null): NoteText {
  return { wins: note?.wins ?? "", improve: note?.improve ?? "", next: note?.next ?? "" }
}

/**
 * 我的复盘：三段自己写的话，跟着所选的周走。
 * 草稿和已保存的内容都按周分开记：一周没被编辑过，就直接拿它原本的复盘当草稿
 * （等于第一次显示时用原复盘初始化），第一次输入才把这一周写进草稿。
 * 草稿和已保存的内容有出入时，「保存」才能点；保存后两者一致，按钮重新变灰。
 */
export function ReportNotes() {
  const week = useReportWeek((state) => state.week)
  const report = useMemo(() => weekReport(week), [week])
  const [drafts, setDrafts] = useState<NotesByWeek>({})
  const [saved, setSaved] = useState<NotesByWeek>({})

  const initial = textOf(report.note)
  const draft = drafts[week] ?? initial
  const savedText = saved[week] ?? initial
  const dirty = FIELDS.some((field) => draft[field.key] !== savedText[field.key])

  function edit(key: keyof NoteText, value: string) {
    setDrafts((prev) => ({ ...prev, [week]: { ...(prev[week] ?? initial), [key]: value } }))
  }

  function save() {
    setSaved((prev) => ({ ...prev, [week]: draft }))
    toast.success("复盘已保存")
  }

  return (
    <section id="notes" aria-labelledby="notes-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <NotebookPen className="size-4 text-fg-2" aria-hidden />
        <h2 id="notes-title" className="text-sm font-medium">
          我的复盘
        </h2>
        <Button size="sm" className="ml-auto" data-notes-save disabled={!dirty} onClick={save}>
          保存
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {FIELDS.map((field) => (
          <Field key={field.key} id={field.id} label={field.label}>
            <Textarea
              id={field.id}
              data-notes-field={field.key}
              rows={4}
              placeholder="写一两句"
              className="min-h-20"
              value={draft[field.key]}
              onChange={(event) => edit(field.key, event.target.value)}
            />
          </Field>
        ))}
      </div>
    </section>
  )
}

export default ReportNotes
