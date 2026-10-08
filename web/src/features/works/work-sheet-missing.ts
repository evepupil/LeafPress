"use client"

import { useEffect, useRef } from "react"

/** 地址栏里的编号加载完成后仍不存在时通知外面移除，只处理一次。 */
export function useCloseWhenMissing(workId: string | null, found: boolean, ready: boolean, onClose: () => void): void {
  const handled = useRef<string | null>(null)
  useEffect(() => {
    const missing = ready && workId !== null && !found
    if (!missing) {
      handled.current = null
      return
    }
    if (handled.current === workId) return
    handled.current = workId
    onClose()
  }, [found, onClose, ready, workId])
}
