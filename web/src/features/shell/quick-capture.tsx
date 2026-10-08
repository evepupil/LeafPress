"use client"

import { useState } from "react"
import { toast } from "sonner"

import { AccountTag } from "@/components/base/account-tag"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ACCOUNTS } from "@/data/accounts"
import { useIdeas } from "@/state/ideas"
import { useUi } from "@/state/ui"

/** 「不挂账号」在下拉里的取值（下拉不接受空字符串） */
const NO_ACCOUNT = "none"

/** 表单只在弹窗打开时挂载，每次打开都是一份干净的草稿，提交或取消后自然清空 */
function CaptureForm({ onClose }: { onClose: () => void }) {
  const add = useIdeas((state) => state.add)
  const [text, setText] = useState("")
  const [accountId, setAccountId] = useState(NO_ACCOUNT)

  const content = text.trim()

  const submit = () => {
    if (!content) return
    add({ text: content, accountId: accountId === NO_ACCOUNT ? undefined : accountId, source: "quick" })
    onClose()
    toast.success("记下了")
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
            // ⌘ / Ctrl + 回车直接提交；输入法选词时的回车不算
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="quick-capture-account" aria-label="账号" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={NO_ACCOUNT}>不挂账号</SelectItem>
            {ACCOUNTS.map((item) => (
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
        <Button type="submit" disabled={!content} data-quick-capture-submit>
          记下
        </Button>
      </DialogFooter>
    </form>
  )
}

/** 记灵感弹窗：侧栏、命令面板、手机右下角的按钮和 N 键都打开它 */
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
        <CaptureForm onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
