"use client"

import { Bot, Plus } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { Button } from "@/components/ui/button"
import { ConvertDialog } from "@/components/work/convert-dialog"
import type { Work, WorkStatus } from "@/data/types"
import { PageFrame, type ViewTab } from "@/features/shell/page-frame"
import { filterWorks } from "@/lib/board"
import { shortTitle } from "@/lib/metrics"
import { type ConvertSource, pickNext } from "@/lib/work-engine"
import { useUi } from "@/state/ui"
import { useWorks } from "@/state/works"
import { WorkSheet } from "./work-sheet"
import { WorksBoard } from "./works-board"
import { WorksFilterBar } from "./works-filters"
import { WorksList } from "./works-list"
import {
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

/**
 * 作品页：一个作品就是一条任务。视图栏（看板 / 列表、两个动作）、筛选栏、四列看板或列表、右侧的详情抽屉共用这里的状态。
 * 看板或列表、平台、只看哪一列、打开哪个作品都写在地址栏里，侧栏的视图、命令面板、提醒都靠改地址栏跳进来。
 */
export function WorksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramsKey = searchParams.toString()

  const works = useWorks((state) => state.works)
  const runAi = useWorks((state) => state.runAi)
  const remove = useWorks((state) => state.remove)
  const setNewWorkOpen = useUi((state) => state.setNewWorkOpen)

  const current = readWorksParams(searchParams)
  const [view, setView] = useState<WorksView>(current.view)
  const [platform, setPlatform] = useState<PlatformFilter>(current.platform)
  const [status, setStatus] = useState<WorkStatus | null>(current.status)
  const [query, setQuery] = useState("")
  const [convertSource, setConvertSource] = useState<ConvertSource | null>(null)
  const [deleting, setDeleting] = useState<Work | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // 已经停在本页时，侧栏的视图、命令面板、返回键都只是改地址栏，页面不会重新挂载，参数变了要跟上。
  // 写法是「输入变了就在渲染时调整状态」：记下上一次的参数，不一样就当场改，不用 effect。
  const [prevParams, setPrevParams] = useState(paramsKey)
  if (paramsKey !== prevParams) {
    setPrevParams(paramsKey)
    setView(current.view)
    setPlatform(current.platform)
    setStatus(current.status)
  }

  const openId = current.openId

  /** 在当前参数上改一项：默认值（看板、全部平台）和空值都不写进地址栏 */
  const setParam = (name: string, value: string | null) => {
    router.replace(worksHref(withParam(paramsKey, name, value)), { scroll: false })
  }

  const visible = useMemo(() => filterWorks(works, { platform, query }), [works, platform, query])
  const counts = useMemo(() => platformCounts(works, query), [works, query])
  const queue = useMemo(() => todoQueue(works), [works])

  const handlers: WorkHandlers = {
    onOpen: (id) => setParam("open", id),
    onConvert: (work) => setConvertSource({ kind: "work", work }),
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

  const pickNextWork = () => {
    const next = pickNext(works)
    if (!next) {
      toast("待实现里没有能直接做的")
      return
    }
    const result = runAi(next.id)
    if (!result.ok) {
      toast(result.reason)
      return
    }
    setParam("open", next.id)
    toast(`AI 开始做《${next.title}》`)
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove(deleting.id)
    if (openId === deleting.id) setParam("open", null)
    toast("已删除")
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
        <>
          <Button variant="outline" size="sm" data-pick-next aria-label="让 AI 挑一个做" onClick={pickNextWork}>
            <Bot />
            <span className="hidden sm:inline">让 AI 挑一个做</span>
          </Button>
          <Button size="sm" data-new-work aria-label="新建作品" onClick={() => setNewWorkOpen(true)}>
            <Plus />
            <span className="hidden sm:inline">新建作品</span>
          </Button>
        </>
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
        onConfirm={confirmDelete}
      />
    </PageFrame>
  )
}

export default WorksPage
