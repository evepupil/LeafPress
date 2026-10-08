"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { ConvertDialog } from "@/components/work/convert-dialog"
import { IDEA_STATUS_ORDER } from "@/data/labels"
import type { Idea } from "@/data/types"
import type { ConvertSource } from "@/lib/work-engine"
import { useIdeas } from "@/state/ideas"
import { useWorks } from "@/state/works"
import { IdeaColumn } from "./board-column"
import { IdeaSheet } from "./board-sheet"

/**
 * 灵感看板：收件箱、值得写、已转作品三列。
 * 点卡片从右侧滑出编辑抽屉（和地址栏的 open 参数同步，链接发给别人也能直接打开），
 * 卡片可以拖到别的列，「转作品」选几个平台就生成几个作品。
 */
export function IdeaBoard() {
  const router = useRouter()
  const openId = useSearchParams().get("open")
  const ideas = useIdeas((state) => state.ideas)
  const works = useWorks((state) => state.works)
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null)
  const [deleting, setDeleting] = useState<Idea | null>(null)

  const worksById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works])
  const openIdea = openId ? ideas.find((idea) => idea.id === openId) : undefined

  const setOpen = (id: string | null) => router.replace(id ? `/ideas/?open=${encodeURIComponent(id)}` : "/ideas/", { scroll: false })
  const convert = (idea: Idea) => setConvertSource({ kind: "idea", idea })

  const confirmDelete = () => {
    if (!deleting) return
    useIdeas.getState().remove(deleting.id)
    if (openId === deleting.id) setOpen(null)
    setDeleting(null)
    toast("已删除")
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
        onConfirm={confirmDelete}
      />
    </section>
  )
}

export default IdeaBoard
