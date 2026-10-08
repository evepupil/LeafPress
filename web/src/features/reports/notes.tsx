"use client"

import { type DayKey, type WeeklyNote } from "@leafpress/core"
import { NotebookPen } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { saveNote } from "@/state/actions/data"
import { useSelectedReport } from "./use-week-report"

interface NoteText {
  wins: string
  improve: string
  next: string
}
type NotesByWeek = Partial<Record<DayKey, NoteText>>
const FIELDS: { key: keyof NoteText; id: string; label: string }[] = [
  { key: "wins", id: "notes-wins", label: "做得好的" },
  { key: "improve", id: "notes-improve", label: "要改的" },
  { key: "next", id: "notes-next", label: "下周做什么" },
]
function textOf(note: WeeklyNote | null): NoteText {
  return { wins: note?.wins ?? "", improve: note?.improve ?? "", next: note?.next ?? "" }
}

export function ReportNotes() {
  const { week, report } = useSelectedReport()
  const [drafts, setDrafts] = useState<NotesByWeek>({})
  const [saved, setSaved] = useState<NotesByWeek>({})
  const [saving, setSaving] = useState(false)
  const initial = textOf(report?.note ?? null)
  const draft = drafts[week] ?? initial
  const savedText = saved[week] ?? initial
  const dirty = FIELDS.some((field) => draft[field.key] !== savedText[field.key])

  const edit = (key: keyof NoteText, value: string) =>
    setDrafts((previous) => ({ ...previous, [week]: { ...(previous[week] ?? initial), [key]: value } }))
  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await saveNote(week, draft)
      setSaved((previous) => ({ ...previous, [week]: draft }))
      toast.success("复盘已保存")
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存复盘失败")
    } finally {
      setSaving(false)
    }
  }

  if (!report) return null
  return (
    <section id="notes" aria-labelledby="notes-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <NotebookPen className="size-4 text-fg-2" aria-hidden />
        <h2 id="notes-title" className="text-sm font-medium">
          我的复盘
        </h2>
        <Button size="sm" className="ml-auto" data-notes-save disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "正在保存…" : "保存"}
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
