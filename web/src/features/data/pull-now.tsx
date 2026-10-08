"use client"

import { LoaderCircle, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { LATEST_DAY } from "@/data/clock"
import { formatDay } from "@/lib/format"

/** 原型里不真的去拉，等这么久再给结果（毫秒） */
const PULL_DELAY_MS = 1200

/** 视图栏右边的「现在拉一次」：点了转圈 1.2 秒，然后弹出各来源的拉取结果 */
export function PullNowButton() {
  const [pulling, setPulling] = useState(false)

  // 只在拉取中起定时器；组件卸载（离开本页）或状态变化时清掉，不会在别的页面弹提示
  useEffect(() => {
    if (!pulling) return
    const timer = setTimeout(() => {
      setPulling(false)
      toast.warning(`知乎已更新到 ${formatDay(LATEST_DAY)}；博客统计还是返回 401`)
    }, PULL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pulling])

  return (
    <Button
      variant="outline"
      size="sm"
      data-pull-now
      disabled={pulling}
      aria-busy={pulling}
      aria-label="现在拉一次"
      onClick={() => setPulling(true)}
    >
      {pulling ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
      <span className="hidden sm:inline">{pulling ? "拉取中" : "现在拉一次"}</span>
    </Button>
  )
}

export default PullNowButton
