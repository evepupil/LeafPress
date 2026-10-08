"use client"

import { shortTitle, type ConvertSource, type Work, type WorkStatus } from "@leafpress/core"
import { Plus } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { Button } from "@/components/ui/button"
import { ConvertDialog } from "@/components/work/convert-dialog"
import { PageFrame, type ViewTab } from "@/features/shell/page-frame"
import { useUi } from "@/state/ui"
import { useAccounts, useWorks } from "@/state/data"
import { deleteWork } from "@/state/actions/works"
import { WorkSheet } from "./work-sheet"
import { WorksBoard } from "./works-board"
import { WorksFilterBar } from "./works-filters"
import { WorksList } from "./works-list"
import {
  filterWorks,
  platformCounts,
  readWorksParams,
  todoQueue,
  withParam,
  worksHref,
  type PlatformFilter,
  type WorkHandlers,
  type WorksView,
} from "./works-model"

const VIEW_TABS: ViewTab[] = [
  { key: "board", label: "看板" },
  { key: "list", label: "列表" },
]

export function WorksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramsKey = searchParams.toString()
  const works = useWorks()
  const accounts = useAccounts()
  const setNewWorkOpen = useUi((state) => state.setNewWorkOpen)
  const current = readWorksParams(searchParams)
  const [view, setView] = useState<WorksView>(current.view)
  const [platform, setPlatform] = useState<PlatformFilter>(current.platform)
  const [status, setStatus] = useState<WorkStatus | null>(current.status)
  const [query, setQuery] = useState("")
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null)
  const [deleting, setDeleting] = useState<Work | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [prevParams, setPrevParams] = useState(paramsKey)
  if (paramsKey !== prevParams) {
    setPrevParams(paramsKey)
    setView(current.view)
    setPlatform(current.platform)
    setStatus(current.status)
  }
  const openId = current.openId
  const setParam = (name: string, value: string | null) => router.replace(worksHref(withParam(paramsKey, name, value)), { scroll: false })
  const visible = useMemo(() => filterWorks(works, { platform, query }, accounts), [works, platform, query, accounts])
  const counts = useMemo(() => platformCounts(works, query, accounts), [works, query, accounts])
  const queue = useMemo(() => todoQueue(works), [works])
  const handlers: WorkHandlers = {
    onOpen: (id) => setParam("open", id),
    onConvert: (work) => {
      const account = accounts.find((item) => item.id === work.accountId)
      if (account) setConvertSource({ kind: "work", work, platform: account.platform })
    },
    onDelete: (work) => {
      setDeleting(work)
      setDeleteOpen(true)
    },
  }
  const changeView = (next: WorksView) => {
    setView(next)
    setParam("view", next)
  }
  const changePlatform = (next: PlatformFilter) => {
    setPlatform(next)
    setParam("platform", next)
  }
  const clearStatus = () => {
    setStatus(null)
    setParam("status", null)
  }
  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteWork(deleting.id)
      if (openId === deleting.id) setParam("open", null)
      setDeleteOpen(false)
      toast.success("已删除")
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败")
    }
  }
  return (
    <PageFrame
      title="作品"
      meta={
        <span className="tabular" data-works-count>
          {visible.length}
        </span>
      }
      tabs={VIEW_TABS}
      activeTab={view}
      onTabChange={(key) => changeView(key === "list" ? "list" : "board")}
      actions={
        <Button size="sm" data-new-work aria-label="新建作品" onClick={() => setNewWorkOpen(true)}>
          <Plus />
          <span className="hidden sm:inline">新建作品</span>
        </Button>
      }
      filterBar={
        <WorksFilterBar
          platform={platform}
          counts={counts}
          query={query}
          status={status}
          onPlatformChange={changePlatform}
          onQueryChange={setQuery}
          onClearStatus={clearStatus}
        />
      }
    >
      <section id="works" aria-label="作品" className="h-full">
        {view === "board" ? (
          <WorksBoard works={visible} status={status} queue={queue} handlers={handlers} onNewWork={() => setNewWorkOpen(true)} />
        ) : (
          <WorksList works={visible} status={status} onOpen={handlers.onOpen} />
        )}
      </section>
      <WorkSheet workId={openId} onClose={() => setParam("open", null)} onConvert={handlers.onConvert} />
      <ConvertDialog source={convertSource} onClose={() => setConvertSource(null)} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={deleting ? `删除《${shortTitle(deleting.title)}》？` : ""}
        confirmLabel="删除"
        destructive
        onConfirm={() => void confirmDelete()}
      />
    </PageFrame>
  )
}

export default WorksPage
