"use client"

import { WORK_STATUS_LABEL, shortTitle, type Work, type WorkDetail } from "@leafpress/core"
import { Copy, Repeat, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { IconButton } from "@/components/base/icon-button"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { AgentLeaseStatus } from "./agent-lease"
import { Input } from "@/components/ui/input"
import { SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { deleteWork, updateWork } from "@/state/actions/works"
import { useAccounts, useData } from "@/state/data"
import { copyWithToast } from "./work-sheet-actions"
import { useDraft } from "./work-sheet-draft"

function TitleInput({ work }: { work: Work }) {
  const [title, setTitle] = useDraft(work.title)
  const save = () => {
    const next = title.trim()
    if (!next) {
      setTitle(work.title)
      return
    }
    if (next !== work.title)
      void updateWork(work.id, { title: next }).catch((error: unknown) => toast(error instanceof Error ? error.message : "更新标题失败"))
    setTitle(next)
  }
  return (
    <Input
      id="work-title"
      aria-label="标题"
      title={work.title}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur()
      }}
      className="h-auto truncate border-transparent px-0 text-sm font-medium shadow-none hover:border-line-2 focus-visible:border-line-3"
    />
  )
}

function CopyContextButton({ detail, detailError, detailLoading }: { detail?: WorkDetail; detailError?: string; detailLoading: boolean }) {
  return (
    <Button
      size="sm"
      variant="outline"
      data-copy-context
      disabled={!detail}
      title={detailError ?? (detailLoading ? "正在读取任务上下文" : undefined)}
      onClick={() => detail && void copyWithToast(detail.context, "任务上下文已复制")}
    >
      <Copy />
      复制任务上下文
    </Button>
  )
}

function DeleteButton({ work, onClose }: { work: Work; onClose: () => void }) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <IconButton label="删除" size="icon-sm" className="ml-auto" onClick={() => setAsking(true)}>
        <Trash2 />
      </IconButton>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`删除《${shortTitle(work.title)}》？`}
        confirmLabel="删除"
        destructive
        onConfirm={() => {
          void deleteWork(work.id)
            .then(() => {
              onClose()
              toast("已删除")
            })
            .catch((error: unknown) => toast(error instanceof Error ? error.message : "删除失败"))
        }}
      />
    </>
  )
}

export function WorkSheetHeader({
  work,
  detail,
  detailError,
  detailLoading,
  onClose,
  onConvert,
}: {
  work: Work
  detail?: WorkDetail
  detailError?: string
  detailLoading: boolean
  onClose: () => void
  onConvert: (work: Work) => void
}) {
  const account = useAccounts().find((item) => item.id === work.accountId)
  const now = useData((state) => state.boot?.now)
  return (
    <div data-sheet-header className="shrink-0">
      <div className="flex h-10 items-center gap-2 border-b border-line px-4 pr-12">
        <WorkStatusIcon status={work.status} />
        <span className="shrink-0 text-xs text-fg-2">{WORK_STATUS_LABEL[work.status]}</span>
        <span aria-hidden className="shrink-0 text-xs text-fg-3">
          ·
        </span>
        {account && <AccountTag account={account} showPlatform className="shrink-0" />}
        <span className="ml-auto min-w-0 truncate font-mono text-xs text-fg-2" title={work.id} data-work-id>
          {work.id}
        </span>
      </div>
      <SheetTitle className="flex px-4 pt-3">
        <TitleInput work={work} />
      </SheetTitle>
      <SheetDescription className="sr-only">作品详情</SheetDescription>
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-3">
        <AgentLeaseStatus work={work} now={now} />
        <CopyContextButton detail={detail} detailError={detailError} detailLoading={detailLoading} />
        {work.status === "done" && (
          <Button size="sm" variant="outline" data-convert onClick={() => onConvert(work)}>
            <Repeat />
            转作品
          </Button>
        )}
        <DeleteButton work={work} onClose={onClose} />
      </div>
    </div>
  )
}
