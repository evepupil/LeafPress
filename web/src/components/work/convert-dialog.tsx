"use client"

import {
  PLATFORMS,
  defaultBrief,
  derivedFrom,
  isUsable,
  pickWorkflow,
  type Account,
  type ConvertSource,
  type CreateWorksInput,
  type Work,
  type WorkSource,
} from "@leafpress/core"
import { cn } from "cn"
import { Check, Lightbulb } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { focusRing } from "@/lib/styles"
import { createWorks } from "@/state/actions/works"
import { useAccounts, useWorks } from "@/state/data"

function workSource(source: ConvertSource): WorkSource {
  if (source.kind === "idea") return { kind: "idea", ideaId: source.idea.id }
  if (source.kind === "work") return { kind: "work", workId: source.work.id }
  return { kind: "none" }
}

function candidates(source: ConvertSource, accounts: Account[]) {
  return accounts.filter((account) => source.kind !== "work" || account.id !== source.work.accountId)
}

function workflowFor(source: ConvertSource, account: Account) {
  const workflow = pickWorkflow(account.platform, workSource(source), source.kind === "work" ? source.platform : undefined)
  return { workflow, ready: isUsable(workflow, account.settings) }
}

function initialSelection(source: ConvertSource, works: Work[], accounts: Account[]): string[] {
  if (source.kind === "idea") return source.idea.accountId ? [source.idea.accountId] : []
  if (source.kind === "work" && source.platform === "blog") {
    const done = derivedFrom(works, source.work.id).some(
      (work) => accounts.find((account) => account.id === work.accountId)?.platform === "zhihu",
    )
    const account = accounts.find((item) => item.platform === "zhihu")
    return done || !account ? [] : [account.id]
  }
  return []
}

function ConvertForm({ source, onClose, onDone }: { source: ConvertSource; onClose: () => void; onDone?: (works: Work[]) => void }) {
  const router = useRouter()
  const works = useWorks()
  const accounts = useAccounts()
  const [selected, setSelected] = useState<string[]>(() => initialSelection(source, works, accounts))
  const [title, setTitle] = useState("")
  const [brief, setBrief] = useState(() => defaultBrief(source))
  const [saving, setSaving] = useState(false)
  const isNew = source.kind === "new"
  const existing =
    source.kind === "work"
      ? derivedFrom(works, source.work.id)
      : source.kind === "idea"
        ? works.filter((work) => source.idea.workIds.includes(work.id))
        : []
  const ready = selected.length > 0 && (!isNew || title.trim().length > 0) && !saving
  const options = candidates(source, accounts)
  const toggle = (accountId: string) =>
    setSelected((current) => (current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]))

  const submit = async () => {
    if (!ready) return
    const ordered = accounts.map((account) => account.id).filter((id) => selected.includes(id))
    const input: CreateWorksInput = {
      source:
        source.kind === "idea"
          ? { kind: "idea", ideaId: source.idea.id }
          : source.kind === "work"
            ? { kind: "work", workId: source.work.id }
            : { kind: "new", title: title.trim() },
      accountIds: ordered,
      brief,
    }
    setSaving(true)
    try {
      const created = await createWorks(input)
      onClose()
      onDone?.(created)
      const first = created[0]
      toast.success(`${isNew ? "新建了" : "转成了"} ${created.length} 个作品，放进待实现`, {
        ...(first ? { action: { label: "打开", onClick: () => router.push(`/?open=${first.id}`) } } : {}),
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : "创建作品失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      className="contents"
    >
      <div className="flex max-h-[min(70dvh,560px)] flex-col gap-3 overflow-y-auto px-4 py-4">
        {source.kind === "idea" && (
          <p className="flex min-w-0 items-start gap-2 rounded-md bg-raised px-2.5 py-2 text-sm" data-convert-source>
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
            <span className="line-clamp-2 min-w-0">{source.idea.text}</span>
          </p>
        )}
        {source.kind === "work" && (
          <p className="flex min-w-0 items-start gap-2 rounded-md bg-raised px-2.5 py-2 text-sm" data-convert-source>
            <PlatformMark platform={source.platform} size={16} className="mt-px" />
            <span className="line-clamp-2 min-w-0">{source.work.title}</span>
          </p>
        )}
        {isNew && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="convert-title">标题</Label>
            <Input id="convert-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
        )}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">发到哪些平台</legend>
          <div className="flex flex-col gap-px overflow-hidden rounded-md border border-line">
            {options.map((account) => {
              const checked = selected.includes(account.id)
              const { workflow, ready: usable } = workflowFor(source, account)
              const already = existing.filter((work) => work.accountId === account.id).length
              return (
                <button
                  key={account.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  data-convert-account={account.id}
                  onClick={() => toggle(account.id)}
                  className={cn(
                    "flex min-h-10 w-full min-w-0 items-center gap-2 bg-card px-2.5 py-1.5 text-left transition-colors duration-(--dur-fast) hover:bg-hover",
                    focusRing,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      checked ? "border-ink bg-ink text-white" : "border-line-3 bg-card",
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <PlatformMark platform={account.platform} size={16} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {account.name}
                      <span className="text-fg-2"> · {PLATFORMS[account.platform].name}</span>
                    </span>
                    {already > 0 && <span className="block text-xs text-fg-2">已有 {already} 个</span>}
                  </span>
                  <span className={cn("shrink-0 text-xs", usable ? "text-fg-2" : "text-warn")} data-convert-workflow>
                    {workflow.name}
                    {!usable && " · 要配置"}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="convert-brief">要求</Label>
          <Textarea
            id="convert-brief"
            rows={3}
            placeholder="写给 AI 的要求，可以不写"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={!ready} data-convert-submit>
          {saving ? "正在创建…" : selected.length > 0 ? `${isNew ? "新建" : "转成"} ${selected.length} 个作品` : isNew ? "新建" : "转作品"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ConvertDialog({
  source,
  onClose,
  onDone,
}: {
  source: ConvertSource | null
  onClose: () => void
  onDone?: (works: Work[]) => void
}) {
  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>{source?.kind === "new" ? "新建作品" : "转作品"}</DialogTitle>
          <DialogDescription className="sr-only">选要发的平台，每个平台生成一个作品</DialogDescription>
        </DialogHeader>
        {source && (
          <ConvertForm
            key={`${source.kind}-${source.kind === "idea" ? source.idea.id : source.kind === "work" ? source.work.id : source.title}`}
            source={source}
            onClose={onClose}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
