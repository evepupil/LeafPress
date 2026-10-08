"use client"

import { cn } from "cn"
import { ArrowRight, Trash2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Field } from "@/components/base/field"
import { IconButton } from "@/components/base/icon-button"
import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { accountById } from "@/data/accounts"
import { IDEA_SOURCE_LABEL, IDEA_STATUS_LABEL, WORK_STATUS_LABEL } from "@/data/labels"
import type { Idea, Work } from "@/data/types"
import { formatRelative } from "@/lib/format"
import { focusRing } from "@/lib/styles"
import { ignoreToastInteraction } from "@/lib/toast"
import { useIdeas } from "@/state/ideas"
import { draftPatch, sourceDetailOf, worksOf } from "./board-model"
import { AccountSelect } from "./capture-account"

/** 草稿跟着已保存的值走：别处改了（比如页面刚读回浏览器里存的数据）就重新对齐，输入途中不受影响 */
function useDraft(saved: string) {
  const [draft, setDraft] = useState(saved)
  const [seen, setSeen] = useState(saved)
  if (saved !== seen) {
    setSeen(saved)
    setDraft(saved)
  }
  return [draft, setDraft] as const
}

/** 抽屉主体：一句话、细节失焦保存，账号改了立刻保存。换一条灵感时整块重建，草稿不会串 */
function IdeaDraft({ idea, works }: { idea: Idea; works: Work[] }) {
  const update = useIdeas((state) => state.update)
  const [text, setText] = useDraft(idea.text)
  const [detail, setDetail] = useDraft(idea.detail)
  const latest = useRef({ text, detail })
  const detailOfSource = sourceDetailOf(idea)

  useEffect(() => {
    latest.current = { text, detail }
  })

  // 抽屉被 Esc、点外面或关闭按钮收起时，还没来得及失焦的修改也存下来
  useEffect(() => {
    const id = idea.id
    return () => {
      const saved = useIdeas.getState().ideas.find((item) => item.id === id)
      if (!saved) return
      const patch = draftPatch(saved, latest.current.text, latest.current.detail)
      if (patch) update(id, patch)
    }
  }, [idea.id, update])

  const save = () => {
    const patch = draftPatch(idea, text, detail)
    if (patch) update(idea.id, patch)
    // 清空的一句话还原，首尾多余的空格去掉
    setText(patch?.text ?? idea.text)
    setDetail(patch?.detail ?? idea.detail)
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <Field id="idea-text" label="一句话">
        <Textarea id="idea-text" rows={2} value={text} onChange={(event) => setText(event.target.value)} onBlur={save} />
      </Field>
      <Field id="idea-detail" label="细节">
        <Textarea
          id="idea-detail"
          rows={5}
          placeholder="想写什么、素材在哪"
          className="min-h-28"
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          onBlur={save}
        />
      </Field>
      <Field id="idea-account" label="账号">
        <AccountSelect
          id="idea-account"
          value={idea.accountId}
          onChange={(accountId) => update(idea.id, { accountId })}
          className="w-full"
        />
      </Field>
      <p className="text-xs text-fg-2 tabular">
        {[IDEA_SOURCE_LABEL[idea.source], detailOfSource, formatRelative(idea.createdAt)].filter(Boolean).join(" · ")}
      </p>
      {works.length > 0 && (
        <section aria-labelledby="idea-works-title" className="flex flex-col gap-1">
          <h3 id="idea-works-title" className="text-xs font-medium text-fg-2">
            转出去的作品
          </h3>
          <ul className="flex flex-col">
            {works.map((work) => (
              <li
                key={work.id}
                className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-(--dur-fast) hover:bg-hover"
              >
                <WorkStatusIcon status={work.status} />
                <Link href={`/?open=${work.id}`} title={work.title} className={cn("min-w-0 flex-1 truncate text-sm", focusRing)}>
                  {work.title}
                </Link>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-2">
                  <PlatformMark platform={accountById(work.accountId).platform} size={14} />
                  {WORK_STATUS_LABEL[work.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * 灵感编辑抽屉，从右侧滑出。打开的是地址栏 open 参数对应的那条灵感，找不到就不渲染。
 * 抽屉里改一句话、细节、账号；底部可以转作品或删除。
 */
export function IdeaSheet({
  idea,
  worksById,
  onClose,
  onConvert,
  onDelete,
}: {
  idea: Idea | undefined
  worksById: ReadonlyMap<string, Work>
  onClose(): void
  onConvert(idea: Idea): void
  onDelete(idea: Idea): void
}) {
  if (!idea) return null

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
        onInteractOutside={ignoreToastInteraction}
      >
        <SheetHeader className="h-10 flex-row items-center gap-2 border-b border-line py-0 pr-12">
          <SheetTitle>灵感</SheetTitle>
          <LabelChip>{IDEA_STATUS_LABEL[idea.status]}</LabelChip>
          <SheetDescription className="sr-only">编辑灵感</SheetDescription>
        </SheetHeader>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <IdeaDraft key={idea.id} idea={idea} works={worksOf(idea, worksById)} />
        </div>
        <div className="flex gap-2 border-t border-line px-4 py-3">
          <Button size="sm" data-sheet-convert onClick={() => onConvert(idea)}>
            <ArrowRight />
            转作品
          </Button>
          <IconButton label="删除" className="ml-auto" onClick={() => onDelete(idea)}>
            <Trash2 />
          </IconButton>
        </div>
      </SheetContent>
    </Sheet>
  )
}
