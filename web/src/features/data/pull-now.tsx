"use client"

import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { pullNow } from "@/state/actions/data"

export function PullNowButton() {
  const [pulling, setPulling] = useState(false)

  const pull = async () => {
    setPulling(true)
    try {
      const result = await pullNow()
      toast(result.note)
    } catch (error) {
      toast(error instanceof Error ? error.message : "拉取失败")
    } finally {
      setPulling(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      data-pull-now
      disabled={pulling}
      aria-busy={pulling}
      aria-label="现在拉一次"
      onClick={() => void pull()}
    >
      {pulling ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
      <span className="hidden sm:inline">{pulling ? "拉取中" : "现在拉一次"}</span>
    </Button>
  )
}

export default PullNowButton
