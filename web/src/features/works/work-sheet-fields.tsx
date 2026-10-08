"use client"

import { ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { IconButton } from "@/components/base/icon-button"
import { ColorDot } from "@/components/base/marks"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { accountById } from "@/data/accounts"
import type { Work } from "@/data/types"
import { workflowById, workflowsFor } from "@/data/workflows"
import { useWorks } from "@/state/works"
import { useDraft } from "./work-sheet-draft"
import { timeText, workflowLocked } from "./work-sheet-model"
import { WorkSheetOrigin } from "./work-sheet-origin"
import { FieldRow, QUIET_TRIGGER, SheetSection, VALUE_CELL } from "./work-sheet-parts"

/** 栏目：改了立刻保存 */
function ColumnRow({ work }: { work: Work }) {
  const update = useWorks((state) => state.update)
  const account = accountById(work.accountId)

  return (
    <FieldRow label="栏目" htmlFor="work-column">
      <Select value={work.columnId} onValueChange={(columnId) => update(work.id, { columnId })}>
        <SelectTrigger id="work-column" className={QUIET_TRIGGER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {account.columns.map((column) => (
            <SelectItem key={column.id} value={column.id}>
              <ColorDot color={column.color} />
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

/** 工作流：同一个平台里可以换，但只有还没开始做的待实现作品能换 */
function WorkflowRow({ work }: { work: Work }) {
  const update = useWorks((state) => state.update)
  const locked = workflowLocked(work)
  const options = workflowsFor(accountById(work.accountId).platform)

  return (
    <>
      <FieldRow label="工作流" htmlFor="work-workflow">
        <Select
          value={work.workflowId}
          disabled={locked}
          onValueChange={(workflowId) => {
            update(work.id, { workflowId })
            toast(`换成了「${workflowById(workflowId).name}」`)
          }}
        >
          <SelectTrigger id="work-workflow" className={QUIET_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {options.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflow.name}
                {workflow.status === "needs-setup" && <span className="text-warn">要配置</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>
      {locked && <dd className="col-start-2 -mt-1 min-w-0 border border-transparent px-2 text-xs text-fg-2">已经开始，不能换</dd>}
    </>
  )
}

/** 发布后的链接：只有已完成的作品有。AI 归档的链接也在这里，可以手改 */
function LinkRow({ work }: { work: Work }) {
  const update = useWorks((state) => state.update)
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
            if (next !== (work.url ?? "")) update(work.id, { url: next })
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

/** 属性：账号（不能改）、栏目、工作流、来源、原稿、链接、时间。左标签右控件的两列 */
export function WorkSheetFields({ work }: { work: Work }) {
  return (
    <SheetSection>
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
        <FieldRow label="账号">
          <div className={VALUE_CELL}>
            <AccountTag account={accountById(work.accountId)} size="md" showPlatform />
          </div>
        </FieldRow>
        <ColumnRow work={work} />
        <WorkflowRow work={work} />
        <WorkSheetOrigin work={work} />
        {work.status === "done" && <LinkRow work={work} />}
        <FieldRow label="时间">
          <div className={VALUE_CELL}>
            <span className="truncate tabular">{timeText(work)}</span>
          </div>
        </FieldRow>
      </dl>
    </SheetSection>
  )
}
