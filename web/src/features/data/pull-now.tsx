"use client"

import { RefreshCw } from "lucide-react"

import { Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { usePullNow } from "./use-pull-now"

export function PullNowButton() {
  const { pulling, pull } = usePullNow()

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
      {pulling ? <Spinner /> : <RefreshCw />}
      <span className="hidden sm:inline">{pulling ? "拉取中" : "现在拉一次"}</span>
    </Button>
  )
}

export default PullNowButton
