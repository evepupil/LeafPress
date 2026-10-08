"use client"

import { Pencil, Target } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { accountById } from "@/data/accounts"
import { TODAY } from "@/data/clock"
import { columnRows } from "@/lib/metrics"
import { ColumnPlan } from "./direction-columns"
import { applyDraft, docOf, draftOf, type DirectionDoc, type DirectionDraft } from "./direction-draft"
import { BenchmarkList, ChangeLog, ChipList, DirectionSection, RuleList } from "./direction-parts"

/** 换账号时整块重新来过，上一个号没存的草稿不会串到下一个号 */
export function DirectionCard({ accountId }: { accountId: string }) {
  return <DirectionPanel key={accountId} accountId={accountId} />
}

function DirectionPanel({ accountId }: { accountId: string }) {
  const account = accountById(accountId)
  const rows = useMemo(() => columnRows(accountId), [accountId])

  const [editing, setEditing] = useState(false)
  // current 是看的时候显示的内容；draft 是编辑框里正在改的文字，点「编辑」时才从 current 生成
  const [current, setCurrent] = useState<DirectionDoc>(() => docOf(account))
  const [draft, setDraft] = useState<DirectionDraft>(() => draftOf(current))

  // 保存或取消后「编辑」按钮会重新出现，把键盘焦点还给它，Tab 顺序不丢
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  const startEdit = () => {
    setDraft(draftOf(current))
    setEditing(true)
  }
  const cancel = () => setEditing(false)
  // 保存：文字拆回列表写进 current，调整记录最前面补一条
  const save = () => {
    setCurrent(applyDraft(current, draft, TODAY))
    setEditing(false)
    toast.success("方向已更新")
  }
  const change = (key: keyof DirectionDraft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }))

  return (
    <section id="direction" aria-labelledby="direction-title" className="rounded-lg border border-line bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <Target className="size-4 text-fg-2" aria-hidden />
        <h2 id="direction-title" className="text-sm font-medium">
          方向
        </h2>
        <div className="ml-auto flex gap-1.5">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancel}>
                取消
              </Button>
              <Button size="sm" onClick={save} data-direction-save>
                保存
              </Button>
            </>
          ) : (
            <Button ref={editButton} variant="ghost" size="sm" onClick={startEdit} data-direction-edit-start>
              <Pencil />
              编辑
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <DirectionSection title="定位" className="md:col-span-2">
          {editing ? (
            <Textarea
              autoFocus
              data-direction-input="positioning"
              aria-label="定位"
              rows={2}
              value={draft.positioning}
              onChange={(event) => change("positioning", event.target.value)}
            />
          ) : current.positioning ? (
            <p className="text-sm break-words" data-direction-positioning>
              {current.positioning}
            </p>
          ) : (
            <p className="text-sm text-fg-2" data-direction-positioning>
              还没写定位
            </p>
          )}
        </DirectionSection>

        <DirectionSection title="写给谁">
          {editing ? (
            <Input
              data-direction-input="audience"
              aria-label="写给谁"
              value={draft.audience}
              onChange={(event) => change("audience", event.target.value)}
            />
          ) : (
            <ChipList items={current.audience} />
          )}
        </DirectionSection>

        <DirectionSection title="禁用句式">
          {editing ? (
            <Input
              data-direction-input="bannedPhrases"
              aria-label="禁用句式"
              value={draft.bannedPhrases}
              onChange={(event) => change("bannedPhrases", event.target.value)}
            />
          ) : (
            <ChipList items={current.bannedPhrases} />
          )}
        </DirectionSection>

        <DirectionSection title="栏目" className="md:col-span-2">
          <ColumnPlan rows={rows} />
        </DirectionSection>

        <DirectionSection title="文风规矩" className="md:col-span-2">
          {editing ? (
            <Textarea
              data-direction-input="styleRules"
              aria-label="文风规矩"
              rows={5}
              value={draft.styleRules}
              onChange={(event) => change("styleRules", event.target.value)}
            />
          ) : (
            <RuleList items={current.styleRules} />
          )}
        </DirectionSection>

        <DirectionSection title="对标">
          <BenchmarkList items={account.benchmarks} />
        </DirectionSection>

        <DirectionSection title="调整记录">
          <ChangeLog items={current.log} />
        </DirectionSection>
      </div>
    </section>
  )
}

export default DirectionCard
