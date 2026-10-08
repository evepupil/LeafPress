"use client"

import { useState, type FormEvent } from "react"

import { Field } from "@/components/base/field"
import { ColorDot } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS, accountById } from "@/data/accounts"
import type { NewWorkInput } from "./works-workspace-model"
import { AccountOptionContent } from "./works-workspace-parts"

/** 新作品弹窗：填标题，选账号和栏目，加到「灵感」列。表单放在内容里，关掉再开就是一张白纸 */
export function NewWorkDialog({
  open,
  onOpenChange,
  onCreate,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onCreate(input: NewWorkInput): void
  /** 弹窗关掉后焦点去哪：交给外面，让它回到「新作品」按钮 */
  onCloseAutoFocus(event: Event): void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus} className="gap-0 p-0 sm:max-w-[420px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>新作品</DialogTitle>
        </DialogHeader>
        <NewWorkForm onCancel={() => onOpenChange(false)} onCreate={onCreate} />
      </DialogContent>
    </Dialog>
  )
}

function NewWorkForm({ onCancel, onCreate }: { onCancel(): void; onCreate(input: NewWorkInput): void }) {
  const [title, setTitle] = useState("")
  const [accountId, setAccountId] = useState(ACCOUNTS[0].id)
  const [columnId, setColumnId] = useState(ACCOUNTS[0].columns[0].id)
  const account = accountById(accountId)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = title.trim()
    if (!value) return
    onCreate({ title: value, accountId, columnId })
  }

  return (
    <form noValidate onSubmit={submit} className="contents">
      <div className="flex flex-col gap-3 px-4 py-4">
        <Field id="new-work-title" label="标题">
          <Input id="new-work-title" autoFocus autoComplete="off" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field id="new-work-account" label="账号">
          {/* 换账号时栏目跟着回到新账号的第一个 */}
          <Select
            value={accountId}
            onValueChange={(next) => {
              setAccountId(next)
              setColumnId(accountById(next).columns[0].id)
            }}
          >
            <SelectTrigger id="new-work-account" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {ACCOUNTS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  <AccountOptionContent account={item} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="new-work-column" label="栏目">
          {/* 栏目选项随账号整套更换：用账号编号当 key 重新生成下拉，否则 Radix 在「值和选项同时变」时会把值清成空；空值一律不收 */}
          <Select
            key={accountId}
            value={columnId}
            onValueChange={(next) => {
              if (next) setColumnId(next)
            }}
          >
            <SelectTrigger id="new-work-column" className="w-full">
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
        </Field>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" data-new-work-submit disabled={title.trim() === ""}>
          加上
        </Button>
      </DialogFooter>
    </form>
  )
}
