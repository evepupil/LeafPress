"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addIdea } from "@/state/actions/ideas"
import { useAccounts } from "@/state/data"
import { useUi } from "@/state/ui"

const NO_ACCOUNT = "none"

function CaptureForm({ onClose }: { onClose: () => void }) {
  const accounts = useAccounts()
  const [text, setText] = useState("")
  const [accountId, setAccountId] = useState(NO_ACCOUNT)
  const [saving, setSaving] = useState(false)
  const content = text.trim()

  const submit = async () => {
    if (!content || saving) return
    setSaving(true)
    try {
      await addIdea({ text: content, ...(accountId !== NO_ACCOUNT ? { accountId } : {}), source: "quick" })
      onClose()
      toast.success("记下了")
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存灵感失败")
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
      <div className="flex flex-col gap-3 px-4 py-4">
        <Textarea
          id="quick-capture-text"
          aria-label="灵感内容"
          autoFocus
          rows={3}
          placeholder="一句话就行"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="quick-capture-account" aria-label="账号" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NO_ACCOUNT}>不挂账号</SelectItem>
            {accounts.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                <AccountTag account={item} size="md" showPlatform />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter className="border-t border-line px-4 py-3">
        <Button type="button" variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" disabled={!content || saving} data-quick-capture-submit>
          记下
        </Button>
      </DialogFooter>
    </form>
  )
}

export function QuickCapture() {
  const open = useUi((state) => state.captureOpen)
  const setOpen = useUi((state) => state.setCaptureOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>记灵感</DialogTitle>
          <DialogDescription className="sr-only">用一句话记下灵感，可以挂到账号</DialogDescription>
        </DialogHeader>
        {open && <CaptureForm onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}
