"use client"

import { useEffect } from "react"

import { useAccounts } from "@/state/accounts"
import { useIdeas } from "@/state/ideas"
import { useWorks } from "@/state/works"

/**
 * 页面挂载后再读浏览器里存的作品、灵感和账号上改过的东西。
 * 静态导出的页面是按初始数据渲染的，首屏先保持一致，挂载后再换成存下来的，避免前后对不上的告警。
 */
export function StoreHydration() {
  useEffect(() => {
    void useWorks.persist.rehydrate()
    void useIdeas.persist.rehydrate()
    void useAccounts.persist.rehydrate()
  }, [])
  return null
}
