"use client"

import { useCallback } from "react"

import { notify, toastFailure } from "@/lib/notify"
import { pullNow } from "@/state/actions/data"
import { runBusy, useBusy } from "@/state/busy"
import { describePull } from "./pull-result"

/**
 * 所有「现在拉一次」「重试」「现在拉取」共用一个忙标记：第一次拉博客要补半年历史，可能要等好一会儿，
 * 这期间别处的拉数据按钮也显示加载并禁用，不会同时发出第二次拉取。
 */
const PULL_KEY = "pull"

/** 不传账号就拉全部；提示条用服务端的 note，失败时说服务端给的原因和怎么修 */
export function usePullNow(accountId?: string) {
  const pulling = useBusy(PULL_KEY)
  const pull = useCallback(
    () =>
      runBusy(PULL_KEY, async () => {
        try {
          notify(describePull(await pullNow(accountId ? [accountId] : undefined)))
        } catch (error) {
          toastFailure(error, "拉取失败")
        }
      }),
    [accountId],
  )
  return { pulling, pull }
}
