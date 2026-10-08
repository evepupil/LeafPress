"use client"

import { IDEA_SOURCE_LABEL, IDEA_STATUS_LABEL, WORK_STATUS_LABEL, formatRelative, type Idea, type Work } from "@leafpress/core"
import { cn } from "cn"
import { ArrowRight, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Field } from "@/components/base/field"
import { IconButton } from "@/components/base/icon-button"
import { LabelChip } from "@/components/base/label-chip"
import { PlatformMark } from "@/components/base/marks"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { focusRing } from "@/lib/styles"
import { ignoreToastInteraction } from "@/lib/toast"
import { useNow } from "@/lib/local-clock"
import { updateIdea } from "@/state/actions/ideas"
import { useAccount } from "@/state/data"
import { draftPatch, sourceDetailOf, worksOf } from "./board-model"
import { AccountSelect } from "./capture-account"

function IdeaWork({ work }: { work: Work }) {
  const account = useAccount(work.accountId)
  return (
    <li className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 transition-colors duration-(--dur-fast) hover:bg-hover">
      <WorkStatusIcon status={work.status} />
      <Link href={`/?open=${work.id}`} title={work.title} className={cn("min-w-0 flex-1 truncate text-sm", focusRing)}>
        {work.title}
      </Link>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-2">
        {account && <PlatformMark platform={account.platform} size={14} />}
        {WORK_STATUS_LABEL[work.status]}
      </span>
    </li>
  )
}

function IdeaDraft({ idea, works }: { idea: Idea; works: Work[] }) {
  const [text, setText] = useState(idea.text)
  const [detail, setDetail] = useState(idea.detail)
  const latest = useRef({ text: idea.text, detail: idea.detail })
  const baseline = useRef(idea)
  const queue = useRef(Promise.resolve())
  const now = useNow()
  const detailOfSource = sourceDetailOf(idea)

  const saveDraft = useCallback(
    (snapshot: { text: string; detail: string }) => {
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          const patch = draftPatch(baseline.current, snapshot.text, snapshot.detail)
          if (!patch) return
          await updateIdea(idea.id, patch)
          baseline.current = {
            ...baseline.current,
            ...(patch.text !== undefined ? { text: patch.text } : {}),
            ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
          }
        })
        .catch((error: unknown) => {
          toast(error instanceof Error ? error.message : "保存灵感失败")
        })
      return queue.current
    },
    [idea.id],
  )

  useEffect(() => () => void saveDraft(latest.current), [saveDraft])

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <Field id="idea-text" label="一句话">
        <Textarea
          id="idea-text"
          rows={2}
          value={text}
          onChange={(event) => {
            const next = event.target.value
            latest.current = { ...latest.current, text: next }
            setText(next)
          }}
          onBlur={() => void saveDraft(latest.current)}
        />
      </Field>
      <Field id="idea-detail" label="细节">
        <Textarea
          id="idea-detail"
          rows={5}
          placeholder="想写什么、素材在哪"
          className="min-h-28"
          value={detail}
          onChange={(event) => {
            const next = event.target.value
            latest.current = { ...latest.current, detail: next }
            setDetail(next)
          }}
          onBlur={() => void saveDraft(latest.current)}
        />
      </Field>
      <Field id="idea-account" label="账号">
        <AccountSelect
          id="idea-account"
          value={idea.accountId}
          onChange={(accountId) =>
            void updateIdea(idea.id, { accountId: accountId ?? null }).catch((error: unknown) =>
              toast(error instanceof Error ? error.message : "更新账号失败"),
            )
          }
          className="w-full"
        />
      </Field>
      <p className="text-xs text-fg-2 tabular">
        {[IDEA_SOURCE_LABEL[idea.source], detailOfSource, now ? formatRelative(idea.createdAt, now) : undefined]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {works.length > 0 && (
        <section aria-labelledby="idea-works-title" className="flex flex-col gap-1">
          <h3 id="idea-works-title" className="text-xs font-medium text-fg-2">
            转出去的作品
          </h3>
          <ul className="flex flex-col">
            {works.map((work) => (
              <IdeaWork key={work.id} work={work} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

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
