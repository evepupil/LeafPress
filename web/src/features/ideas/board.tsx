"use client"

import { IDEA_STATUS_ORDER, toIsoTime, type Idea, type ConvertSource, type IdeaStatus } from "@leafpress/core"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { ConvertDialog } from "@/components/work/convert-dialog"
import { deleteIdea, moveIdea } from "@/state/actions/ideas"
import { useData, useIdeas, useWorks } from "@/state/data"
import { useNow } from "@/lib/local-clock"
import { IdeaColumn } from "./board-column"
import { IdeaSheet } from "./board-sheet"
import { moveIdeaPreview } from "./board-model"

export function IdeaBoard() {
  const router = useRouter()
  const openId = useSearchParams().get("open")
  const ideas = useIdeas()
  const moving = useRef(false)
  const now = useNow()
  const displayIdeas = ideas
  const works = useWorks()
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null)
  const [deleting, setDeleting] = useState<Idea | null>(null)
  const worksById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works])
  const openIdea = openId ? displayIdeas.find((idea) => idea.id === openId) : undefined

  const setOpen = (id: string | null) => router.replace(id ? `/ideas/?open=${encodeURIComponent(id)}` : "/ideas/", { scroll: false })
  const convert = (idea: Idea) => setConvertSource({ kind: "idea", idea })
  const onMove = (id: string, status: Exclude<IdeaStatus, "converted">, beforeId: string | null) => {
    if (moving.current) return
    const next = moveIdeaPreview(ideas, id, status, beforeId, now ?? toIsoTime(new Date()))
    if (next === ideas) return
    moving.current = true
    useData.getState().patchBoot((boot) => ({ ...boot, ideas: next }))
    void moveIdea(id, status, beforeId)
      .catch((error: unknown) => toast(error instanceof Error ? error.message : "移动灵感失败"))
      .finally(() => {
        moving.current = false
      })
  }
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
            ideas={displayIdeas}
            worksById={worksById}
            onOpen={setOpen}
            onConvert={convert}
            onDelete={setDeleting}
            onMove={onMove}
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
