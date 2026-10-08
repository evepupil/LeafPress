"use client"

import { useState } from "react"

import { Field } from "@/components/base/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TODAY } from "@/data/clock"
import type { Account } from "@/data/types"
import { formatDay } from "@/lib/format"
import { accountLabel, summaryOf } from "@/lib/metrics"

/** 三个数字框的内容。用字符串存，输入框清空时才表示得出「没填」 */
export interface EntryForm {
  followers: string
  reads: string
  interactions: string
}

/** 打开弹窗时的初始内容：粉丝默认当前粉丝数，本周阅读和互动留空 */
export function blankEntryForm(accountId: string | null): EntryForm {
  return { followers: accountId === null ? "" : String(summaryOf(accountId).followers), reads: "", interactions: "" }
}

/** 手填弹窗：给没有接口的号（公众号、B站、小红书）补一次数据 */
export function EntryDialog({
  account,
  form,
  onChange,
  onClose,
  onSave,
}: {
  /** 要手填的账号；null 表示弹窗关着 */
  account: Account | null
  form: EntryForm
  onChange(field: keyof EntryForm, value: string): void
  onClose(): void
  onSave(): void
}) {
  // 关闭时 account 先变成 null，弹窗还要播一小段淡出动画；
  // 这段时间继续画上一个账号，内容不会在淡出途中先消失
  const [lastAccount, setLastAccount] = useState<Account | null>(account)
  if (account !== null && account !== lastAccount) setLastAccount(account)
  const shown = account ?? lastAccount
  if (shown === null) return null

  const fields: { key: keyof EntryForm; label: string }[] = [
    { key: "followers", label: shown.audienceLabel },
    { key: "reads", label: `本周${shown.readsLabel}` },
    { key: "interactions", label: "本周互动" },
  ]

  return (
    <Dialog open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-entry-dialog>
        <DialogHeader>
          <DialogTitle>手填 · {accountLabel(shown)}</DialogTitle>
        </DialogHeader>
        {/* form 用 contents 摊平，标题、字段、按钮仍是弹窗网格的直接子项；这样输入框里按回车也能保存 */}
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <div className="grid gap-3">
            {fields.map((field) => (
              <Field key={field.key} id={`entry-${field.key}`} label={field.label}>
                <Input
                  id={`entry-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={form[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              </Field>
            ))}
            {/* 同时充当弹窗的描述，读屏软件会在标题后念出来 */}
            <DialogDescription className="text-xs">记在 {formatDay(TODAY)}</DialogDescription>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" data-entry-save disabled={form.followers.trim() === ""}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
