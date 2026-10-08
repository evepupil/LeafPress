"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

import { useWorks } from "@/state/works"

const subscribeHydration = (notify: () => void) => useWorks.persist.onFinishHydration(notify)
const isHydrated = () => useWorks.persist.hasHydrated()
const notHydratedOnServer = () => false

/**
 * 浏览器里存的作品读回来了没有。静态页面先按初始数据渲染，挂载后才读回来；
 * 读回来之前找不到作品，可能只是还没读到，不能当成「编号写错了」。
 */
function useWorksHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, isHydrated, notHydratedOnServer)
}

/** 地址栏里的作品编号在作品列表里找不到（被删了、编号写错）：通知外面把它去掉，只通知一次 */
export function useCloseWhenMissing(workId: string | null, found: boolean, onClose: () => void): void {
  const hydrated = useWorksHydrated()
  const missing = hydrated && workId !== null && !found
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!missing) {
      handled.current = null
      return
    }
    if (handled.current === workId) return
    handled.current = workId
    onClose()
  }, [missing, workId, onClose])
}
