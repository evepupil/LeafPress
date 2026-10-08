"use client"

import { LoaderCircle, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { runSchedule } from "@/state/actions"

/** 点下去后先转这么久（毫秒），再把定时的「拉作品数据」跑一次 */
const PULL_DELAY_MS = 1200

/**
 * 视图栏右边的「现在拉一次」：转圈 1.2 秒，然后把定时工作流「拉作品数据」真的跑一次。
 * 跑完数据来源里那一行的时间变成「刚刚」，并弹出这次的结果。
 */
export function PullNowButton() {
  const [pulling, setPulling] = useState(false)
  // 定时器放在 ref 里：离开本页时清掉，不会在别的页面弹提示，也不会悄悄记下一次运行
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  const pull = () => {
    setPulling(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setPulling(false)
      toast(runSchedule("data-pull"))
    }, PULL_DELAY_MS)
  }

  return (
    <Button variant="outline" size="sm" data-pull-now disabled={pulling} aria-busy={pulling} aria-label="现在拉一次" onClick={pull}>
      {pulling ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
      <span className="hidden sm:inline">{pulling ? "拉取中" : "现在拉一次"}</span>
    </Button>
  )
}

export default PullNowButton
