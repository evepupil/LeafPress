"use client"

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
import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import type { Work } from "@/data/types"
import { derivedFrom } from "@/lib/board"
import { focusRing } from "@/lib/styles"
import { type ConvertSource, defaultBrief, workflowForConvert } from "@/lib/work-engine"
import { convertToWorks } from "@/state/actions"
import { useWorks } from "@/state/works"

/** 能选的账号：来源是作品时去掉它自己所在的账号 */
function candidates(source: ConvertSource) {
  return ACCOUNTS.filter((account) => source.kind !== "work" || account.id !== source.work.accountId)
}

/** 默认勾上的账号：灵感挂了账号就勾它；博客作品默认勾知乎（还没转过的话） */
function initialSelection(source: ConvertSource, works: Work[]): string[] {
  if (source.kind === "idea") return source.idea.accountId ? [source.idea.accountId] : []
  if (source.kind === "work" && accountById(source.work.accountId).platform === "blog") {
    const done = derivedFrom(works, source.work.id).some((work) => work.accountId === "zhihu-yiye")
    return done ? [] : ["zhihu-yiye"]
  }
  return []
}

function ConvertForm({ source, onClose, onDone }: { source: ConvertSource; onClose: () => void; onDone?: (works: Work[]) => void }) {
  const router = useRouter()
  const works = useWorks((state) => state.works)
  const [selected, setSelected] = useState<string[]>(() => initialSelection(source, works))
  const [title, setTitle] = useState("")
  const [brief, setBrief] = useState(() => defaultBrief(source))
  const isNew = source.kind === "new"
  const existing =
    source.kind === "work"
      ? derivedFrom(works, source.work.id)
      : source.kind === "idea"
        ? works.filter((work) => source.idea.workIds.includes(work.id))
        : []
  const ready = selected.length > 0 && (!isNew || title.trim().length > 0)

  const toggle = (accountId: string) =>
    setSelected((current) => (current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]))

  const submit = () => {
    if (!ready) return
    // 按账号在侧栏里的顺序生成，编号和顺序每次一样
    const ordered = ACCOUNTS.map((account) => account.id).filter((id) => selected.includes(id))
    const created = convertToWorks(isNew ? { kind: "new", title } : source, ordered, brief)
    onClose()
    onDone?.(created)
    toast.success(`${isNew ? "新建了" : "转成了"} ${created.length} 个作品，放进待实现`, {
      action: { label: "打开", onClick: () => router.push(`/?open=${created[0].id}`) },
    })
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
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
            <PlatformMark platform={accountById(source.work.accountId).platform} size={16} className="mt-px" />
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
            {candidates(source).map((account) => {
              const checked = selected.includes(account.id)
              const { workflow } = workflowForConvert(isNew ? { kind: "new", title } : source, account.id)
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
                  <span className={cn("shrink-0 text-xs", workflow.status === "ready" ? "text-fg-2" : "text-warn")} data-convert-workflow>
                    {workflow.name}
                    {workflow.status === "needs-setup" && " · 要配置"}
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
          {selected.length > 0 ? `${isNew ? "新建" : "转成"} ${selected.length} 个作品` : isNew ? "新建" : "转作品"}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * 转作品弹窗：灵感转作品、已发作品转到别的平台、直接新建作品都用它。
 * 选几个账号就生成几个作品（一个作品只对应一个平台），每个账号后面写着会自动配的工作流。
 * source 为空时关闭；表单只在打开时挂载，每次打开都是干净的。
 */
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
        {source && <ConvertForm source={source} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  )
}
