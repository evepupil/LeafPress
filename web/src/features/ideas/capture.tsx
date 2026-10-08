"use client"

import { SquarePen } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useIdeas } from "@/state/ideas"
import { AccountSelect } from "./capture-account"

/** 速记：一句话记进收件箱最上面。账号选了会留着，连着记几条同一个号的灵感不用重选 */
export function IdeaCapture() {
  const [text, setText] = useState("")
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const ready = text.trim().length > 0

  const submit = () => {
    if (!ready) return
    useIdeas.getState().add({ text, accountId, source: "quick" })
    setText("")
    toast.success("记下了")
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
          submit()
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
            // ⌘ / Ctrl + 回车直接记下；输入法选词时的回车不算
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="flex items-center gap-2">
          <AccountSelect id="idea-capture-account" value={accountId} onChange={setAccountId} className="w-auto min-w-[160px]" />
          <Button type="submit" size="sm" className="ml-auto" data-idea-capture-submit disabled={!ready}>
            记下
          </Button>
        </div>
      </form>
    </section>
  )
}

export default IdeaCapture
