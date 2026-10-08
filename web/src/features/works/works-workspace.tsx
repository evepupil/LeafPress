"use client"

import { FileText, Plus } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { Button } from "@/components/ui/button"
import { PLATFORMS, accountById } from "@/data/accounts"
import { TODAY } from "@/data/clock"
import type { Publication, Work } from "@/data/types"
import { PageFrame, type ViewTab } from "@/features/shell/page-frame"
import { WORK_ROWS, workRow, type WorkRow } from "@/lib/metrics"
import { WorksBoard } from "./works-workspace-board"
import { WorksFilterBar } from "./works-workspace-filters"
import {
  NO_FILTERS,
  matchesFilters,
  nextSort,
  readWorksParams,
  sortRows,
  withOverrides,
  type NewWorkInput,
  type PubOverrides,
  type SortKey,
  type SortState,
  type ViewMode,
  type WorksFilters,
} from "./works-workspace-model"
import { NewWorkDialog } from "./works-workspace-new-dialog"
import { useReturnFocus } from "./works-workspace-parts"
import { WorkSheet } from "./works-workspace-sheet"
import { WorksTable } from "./works-workspace-table"

const VIEW_TABS: ViewTab[] = [
  { key: "board", label: "看板" },
  { key: "list", label: "列表" },
]

/**
 * 作品页的唯一区块：视图栏、筛选栏、看板、列表、详情抽屉、新建弹窗共用这里的一份状态。
 * 数据都在浏览器内存里，刷新就复原。
 */
export function WorksWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // 地址栏参数（open / view / account）挂载时先读一次，放进各状态的初始值：
  // 首帧就是对的，不会先闪一下未筛选的看板；组件挂载那一刻浏览器地址已经就绪。
  // 挂载之后参数再变（本页内跳转）怎么跟，见下面的 paramsKey。
  const [initial] = useState(() => readWorksParams(searchParams))

  const [view, setView] = useState<ViewMode>("board")
  const [filters, setFilters] = useState<WorksFilters>(initial.filters)
  const [sort, setSort] = useState<SortState | null>(null)
  const [showAllPublished, setShowAllPublished] = useState(false)
  const [openId, setOpenId] = useState<string | null>(initial.openId)
  // 抽屉开关和「开的是哪个作品」分开存：关掉时作品编号还在，滑出动画才有内容可演
  const [sheetOpen, setSheetOpen] = useState(initial.openId !== null)
  const [rows, setRows] = useState<WorkRow[]>(WORK_ROWS)
  const [pubOverrides, setPubOverrides] = useState<PubOverrides>({})
  const [newOpen, setNewOpen] = useState(false)
  // 抽屉、弹窗关掉后，键盘焦点回到打开它们的那个按钮
  const sheetFocus = useReturnFocus()
  const dialogFocus = useReturnFocus()

  // 已经停在本页时，侧栏的「待发」、命令面板里选作品都只是改地址，页面不会重新挂载，
  // 所以参数变了要在这里跟上。写法是 React 官方的「输入变了就在渲染时调整状态」：
  // 记下上一次的参数，不一样就当场改状态，React 会马上重渲一次，不会先闪出旧画面（不用 effect）。
  // 只处理参数里有的项，没有的不动：关抽屉时地址会被清成 /works/，这时什么都不做，已选的筛选留着。
  const paramsKey = searchParams.toString()
  const [prevParams, setPrevParams] = useState(paramsKey)
  if (paramsKey !== prevParams) {
    setPrevParams(paramsKey)
    const next = readWorksParams(searchParams)
    if (next.openId !== null) {
      setOpenId(next.openId)
      setSheetOpen(true)
    }
    const patch: Partial<WorksFilters> = {}
    if (next.filters.pendingOnly) patch.pendingOnly = true
    if (next.filters.account !== NO_FILTERS.account) patch.account = next.filters.account
    if (Object.keys(patch).length > 0) setFilters((current) => ({ ...current, ...patch }))
  }

  // 回填链接后的版本按已发算：看板、列表、抽屉、「只看待发」都用套过覆盖的作品
  const effectiveRows = rows.map((row) => withOverrides(row, pubOverrides))
  const filtered = effectiveRows.filter((row) => matchesFilters(row, filters))
  const listRows = sortRows(filtered, sort)
  const openRow = openId ? effectiveRows.find((row) => row.work.id === openId) : undefined

  // 用户自己动了筛选，地址栏里带来的 view / account 就作废了，顺手清掉：
  // 否则地址一直停在 ?view=pending，再点侧栏「待发」时地址不变，筛选也不会重新打开
  const clearFilterParams = () => {
    if (searchParams.has("view") || searchParams.has("account")) router.replace("/works/", { scroll: false })
  }
  const patchFilters = (patch: Partial<WorksFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    clearFilterParams()
  }
  const resetFilters = () => {
    setFilters(NO_FILTERS)
    clearFilterParams()
  }

  const openWork = (id: string) => {
    sheetFocus.remember()
    setOpenId(id)
    setSheetOpen(true)
  }

  const openNewDialog = () => {
    dialogFocus.remember()
    setNewOpen(true)
  }

  // 关抽屉时把地址栏里的 open 等参数一起去掉；本来就没有参数就不用动地址
  const closeSheet = () => {
    setSheetOpen(false)
    if (searchParams.toString() !== "") router.replace("/works/", { scroll: false })
  }

  const backfill = (pub: Publication, url: string) => {
    setPubOverrides((current) => ({ ...current, [pub.id]: { state: "published", url } }))
    toast.success(`已登记，${PLATFORMS[accountById(pub.accountId).platform].name}版本改为已发`)
  }

  // 新作品放在最前面，编号 new-1、new-2……
  const createWork = (input: NewWorkInput) => {
    setRows((current) => {
      const work: Work = {
        id: `new-${current.filter((row) => row.work.id.startsWith("new-")).length + 1}`,
        title: input.title,
        status: "idea",
        accountId: input.accountId,
        columnId: input.columnId,
        tags: [],
        createdAt: TODAY,
        updatedAt: TODAY,
        origin: "idea",
      }
      return [workRow(work), ...current]
    })
    setNewOpen(false)
    toast.success("加到灵感列了")
  }

  return (
    <PageFrame
      title="作品"
      meta={
        <span className="tabular" data-works-count>
          {filtered.length}
        </span>
      }
      tabs={VIEW_TABS}
      activeTab={view}
      onTabChange={(key) => setView(key === "list" ? "list" : "board")}
      actions={
        <Button variant="outline" size="sm" onClick={openNewDialog}>
          <Plus />
          新作品
        </Button>
      }
      filterBar={<WorksFilterBar filters={filters} onChange={patchFilters} onReset={resetFilters} />}
    >
      <section id="works" aria-label="作品">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="没有符合条件的作品"
            className="py-16"
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                清除筛选
              </Button>
            }
          />
        ) : view === "board" ? (
          <WorksBoard rows={filtered} showAllPublished={showAllPublished} onShowAll={() => setShowAllPublished(true)} onOpen={openWork} />
        ) : (
          <WorksTable
            rows={listRows}
            sort={sort}
            onSort={(key: SortKey) => setSort((current) => nextSort(current, key))}
            onOpen={openWork}
          />
        )}
      </section>
      {openRow && (
        <WorkSheet row={openRow} open={sheetOpen} onClose={closeSheet} onBackfill={backfill} onCloseAutoFocus={sheetFocus.restore} />
      )}
      <NewWorkDialog open={newOpen} onOpenChange={setNewOpen} onCreate={createWork} onCloseAutoFocus={dialogFocus.restore} />
    </PageFrame>
  )
}

export default WorksWorkspace
