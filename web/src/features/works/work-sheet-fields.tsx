"use client"

import { isUsable, workflowById, workflowsFor, type Work } from "@leafpress/core"
import { ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { IconButton } from "@/components/base/icon-button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useNow } from "@/lib/local-clock"
import { useAccounts, useToday } from "@/state/data"
import { updateWork } from "@/state/actions/works"
import { useDraft } from "./work-sheet-draft"
import { timeText } from "./work-sheet-model"
import { WorkSheetOrigin } from "./work-sheet-origin"
import { FieldRow, QUIET_TRIGGER, SheetSection, VALUE_CELL } from "./work-sheet-parts"

function WorkflowRow({ work }: { work: Work }) {
  const accounts = useAccounts()
  const account = accounts.find((item) => item.id === work.accountId)
  const locked = work.status !== "todo" || work.step !== 0
  const options = account ? workflowsFor(account.platform) : []
  return (
    <>
      <FieldRow label="工作流" htmlFor="work-workflow">
        <Select
          value={work.workflowId}
          disabled={locked}
          onValueChange={(workflowId) => {
            void updateWork(work.id, { workflowId })
              .then(() => toast(`换成了「${workflowById(workflowId)?.name ?? workflowId}」`))
              .catch((error: unknown) => toast(error instanceof Error ? error.message : "更新工作流失败"))
          }}
        >
          <SelectTrigger id="work-workflow" className={QUIET_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {options.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
                {!isUsable(workflow, account?.settings ?? []) && <span className="text-warn">要配置</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      {locked && <dd className="col-start-2 -mt-1 min-w-0 border border-transparent px-2 text-xs text-fg-2">已经开始，不能换</dd>}
    </>
  )
}

function LinkRow({ work }: { work: Work }) {
  const [url, setUrl] = useDraft(work.url ?? "")
  return (
    <FieldRow label="链接" htmlFor="work-url">
      <div className="flex items-center gap-1">
        <Input
          id="work-url"
          aria-label="链接"
          placeholder="https://…"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onBlur={() => {
            const next = url.trim()
            if (next !== (work.url ?? ""))
              void updateWork(work.id, { url: next || null }).catch((error: unknown) =>
                toast(error instanceof Error ? error.message : "更新链接失败"),
              )
            setUrl(next)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur()
          }}
        />
        {work.url && (
          <IconButton label="打开链接" size="icon-xs" asChild>
            <a href={work.url} target="_blank" rel="noreferrer">
              <ExternalLink />
            </a>
          </IconButton>
        )}
      </div>
    </FieldRow>
  )
}

export function WorkSheetFields({ work }: { work: Work }) {
  const accounts = useAccounts()
  const account = accounts.find((item) => item.id === work.accountId)
  const today = useToday()
  const now = useNow() ?? work.updatedAt
  return (
    <SheetSection>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
        <FieldRow label="账号">
          <div className={VALUE_CELL}>{account && <AccountTag account={account} size="md" showPlatform />}</div>
        </FieldRow>
        <WorkflowRow work={work} />
        <WorkSheetOrigin work={work} />
        {work.status === "done" && <LinkRow work={work} />}
        <FieldRow label="时间">
          <div className={VALUE_CELL}>
            <span className="truncate tabular">{timeText(work, today, now)}</span>
          </div>
        </FieldRow>
      </dl>
    </SheetSection>
  )
}
