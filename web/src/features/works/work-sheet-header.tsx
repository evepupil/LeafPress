"use client"

import { Bot, Copy, Repeat, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { ConfirmDialog } from "@/components/base/confirm-dialog"
import { IconButton } from "@/components/base/icon-button"
import { Spinner, WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { accountById } from "@/data/accounts"
import { WORK_STATUS_LABEL } from "@/data/labels"
import type { Work } from "@/data/types"
import { shortTitle } from "@/lib/metrics"
import { taskContext } from "@/lib/work-engine"
import { useAccounts } from "@/state/accounts"
import { useIdeas } from "@/state/ideas"
import { useWorks } from "@/state/works"
import { copyWithToast, runAiWithToast } from "./work-sheet-actions"
import { useDraft } from "./work-sheet-draft"
import { contextSourceOf, runLook } from "./work-sheet-model"

/** 标题直接在抽屉里改：失焦或回车保存，清空了就还原 */
function TitleInput({ work }: { work: Work }) {
  const update = useWorks((state) => state.update)
  const [title, setTitle] = useDraft(work.title)

  const save = () => {
    const next = title.trim()
    if (!next) {
      setTitle(work.title)
      return
    }
    if (next !== work.title) update(work.id, { title: next })
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
        // 回车 = 失焦保存；输入法选词时的回车不算
        if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur()
      }}
      className="h-auto truncate border-transparent px-0 text-sm font-medium shadow-none hover:border-line-2 focus-visible:border-line-3"
    />
  )
}

function RunButton({ work }: { work: Work }) {
  const running = useWorks((state) => state.running.includes(work.id))
  const look = runLook(work, running)
  if (!look) return null

  return (
    <Button size="sm" data-run-ai disabled={look.busy} onClick={() => runAiWithToast(work.id)}>
      {look.busy ? <Spinner className="text-current" /> : <Bot />}
      {look.label}
    </Button>
  )
}

function CopyContextButton({ work }: { work: Work }) {
  const copy = () => {
    const source = contextSourceOf(work, useWorks.getState().works, useIdeas.getState().ideas)
    // 账号档案页面上改过的用改过的，一起附在说明最后
    const profile = useAccounts.getState().profiles[work.accountId]
    void copyWithToast(taskContext(work, source, profile), "已复制，粘贴给任意 agent 就能接着做")
  }

  return (
    <Button size="sm" variant="outline" data-copy-context onClick={copy}>
      <Copy />
      复制给 AI
    </Button>
  )
}

function DeleteButton({ work, onClose }: { work: Work; onClose: () => void }) {
  const remove = useWorks((state) => state.remove)
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
          remove(work.id)
          onClose()
          toast("已删除")
        }}
      />
    </>
  )
}

/** 抽屉的头：状态和账号、编号、可直接改的标题，以及这个作品能做的几个动作 */
export function WorkSheetHeader({ work, onClose, onConvert }: { work: Work; onClose: () => void; onConvert: (work: Work) => void }) {
  return (
    <div data-sheet-header className="shrink-0">
      <div className="flex h-10 items-center gap-2 border-b border-line px-4 pr-12">
        <WorkStatusIcon status={work.status} />
        <span className="shrink-0 text-xs text-fg-2">{WORK_STATUS_LABEL[work.status]}</span>
        <span aria-hidden className="shrink-0 text-xs text-fg-3">
          ·
        </span>
        <AccountTag account={accountById(work.accountId)} showPlatform className="shrink-0" />
        <span className="ml-auto min-w-0 truncate font-mono text-xs text-fg-2" title={work.id} data-work-id>
          {work.id}
        </span>
      </div>

      <SheetTitle className="flex px-4 pt-3">
        <TitleInput work={work} />
      </SheetTitle>
      <SheetDescription className="sr-only">作品详情</SheetDescription>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2 pb-3">
        <RunButton work={work} />
        <CopyContextButton work={work} />
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
