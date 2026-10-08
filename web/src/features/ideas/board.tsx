"use client"

import { IDEA_STATUS_ORDER, type Idea, type ConvertSource } from "@leafpress/core"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { ConvertDialog } from "@/components/work/convert-dialog"
import { deleteIdea } from "@/state/actions/ideas"
import { useIdeas, useWorks } from "@/state/data"
import { IdeaColumn } from "./board-column"
import { IdeaSheet } from "./board-sheet"

export function IdeaBoard() {
  const router = useRouter()
  const openId = useSearchParams().get("open")
  const ideas = useIdeas()
  const works = useWorks()
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null)
  const [deleting, setDeleting] = useState<Idea | null>(null)
  const worksById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works])
  const openIdea = openId ? ideas.find((idea) => idea.id === openId) : undefined

  const setOpen = (id: string | null) => router.replace(id ? `/ideas/?open=${encodeURIComponent(id)}` : "/ideas/", { scroll: false })
  const convert = (idea: Idea) => setConvertSource({ kind: "idea", idea })
  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteIdea(deleting.id)
      if (openId === deleting.id) setOpen(null)
      setDeleting(null)
      toast("已删除")
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除灵感失败")
    }
  }

  return (
    <section id="board" aria-label="灵感看板">
      <div className="grid items-start gap-(--gap-card) md:grid-cols-3">
        {IDEA_STATUS_ORDER.map((status) => (
          <IdeaColumn
            key={status}
            status={status}
            ideas={ideas}
            worksById={worksById}
            onOpen={setOpen}
            onConvert={convert}
            onDelete={setDeleting}
          />
        ))}
      </div>
      <IdeaSheet idea={openIdea} worksById={worksById} onClose={() => setOpen(null)} onConvert={convert} onDelete={setDeleting} />
      <ConvertDialog source={convertSource} onClose={() => setConvertSource(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="删除这条灵感？"
        description={deleting?.text}
        confirmLabel="删除"
        destructive
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

export default IdeaBoard
