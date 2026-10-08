"use client"

import { SquarePen } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { addIdea } from "@/state/actions/ideas"
import { useAccounts } from "@/state/data"
import { AccountSelect } from "./capture-account"
import { defaultIdeaAccountId } from "./capture-model"

export function IdeaCapture() {
  const accounts = useAccounts()
  const [text, setText] = useState("")
  const [accountId, setAccountId] = useState<string | null | undefined>(undefined)
  const selectedAccountId = accountId === undefined ? defaultIdeaAccountId(accounts) : (accountId ?? undefined)
  const [saving, setSaving] = useState(false)
  const ready = text.trim().length > 0

  const submit = async () => {
    if (!ready || saving) return
    setSaving(true)
    try {
      await addIdea({ text: text.trim(), ...(selectedAccountId ? { accountId: selectedAccountId } : {}), source: "quick" })
      setText("")
      toast.success("记下了")
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存灵感失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="capture" aria-labelledby="capture-title" className="rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <SquarePen className="size-4 text-fg-2" aria-hidden />
        <h2 id="capture-title" className="text-sm font-medium">
          记灵感
        </h2>
      </div>
      <form
        noValidate
        className="flex flex-col gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Textarea
          id="idea-capture-text"
          aria-label="灵感"
          rows={2}
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
        <div className="flex items-center gap-2">
          <AccountSelect
            id="idea-capture-account"
            value={selectedAccountId}
            onChange={(next) => setAccountId(next ?? null)}
            className="w-auto min-w-[160px]"
          />
          <Button type="submit" size="sm" className="ml-auto" data-idea-capture-submit disabled={!ready || saving}>
            记下
          </Button>
        </div>
      </form>
    </section>
  )
}

export default IdeaCapture
