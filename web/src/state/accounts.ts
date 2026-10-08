"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { accountById } from "@/data/accounts"
import type { IsoTime } from "@/data/types"
import type { PullOutcome, PullRecord } from "@/lib/setup"

/**
 * 账号上页面能改的东西：账号档案（Markdown）、接入里填的配置值、「现在拉一次」的结果。
 * 存在浏览器里（localStorage），刷新不丢；「恢复初始数据」清掉。没改过的取 src/data 里的初始值。
 */
interface AccountsState {
  /** 改过的账号档案，键是账号编号 */
  profiles: Record<string, string>
  /** 接入里填过的配置值：账号编号 → 配置项 → 值 */
  config: Record<string, Record<string, string>>
  /** 页面上拉过一次的结果，盖过数据快照里的那次 */
  pulls: Record<string, PullRecord>
  saveProfile(accountId: string, text: string): void
  setConfig(accountId: string, key: string, value: string): void
  recordPulls(outcomes: PullOutcome[], at: IsoTime): void
  reset(): void
}

export const useAccounts = create<AccountsState>()(
  persist(
    (set) => ({
      profiles: {},
      config: {},
      pulls: {},
      saveProfile: (accountId, text) => set((state) => ({ profiles: { ...state.profiles, [accountId]: text } })),
      setConfig: (accountId, key, value) =>
        set((state) => ({ config: { ...state.config, [accountId]: { ...state.config[accountId], [key]: value } } })),
      recordPulls: (outcomes, at) =>
        set((state) => ({
          pulls: {
            ...state.pulls,
            ...Object.fromEntries(
              outcomes.map((item) => [item.accountId, { status: item.status, at, ...(item.reason ? { reason: item.reason } : {}) }]),
            ),
          },
        })),
      reset: () => set({ profiles: {}, config: {}, pulls: {} }),
    }),
    {
      name: "leafpress:accounts",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profiles: state.profiles, config: state.config, pulls: state.pulls }),
      // 首屏先用初始数据渲染，挂载后再读浏览器里存的（见 StoreHydration）
      skipHydration: true,
    },
  ),
)

/** 账号档案：改过的用改过的，没改过的用初始的 */
export function useProfile(accountId: string): string {
  return useAccounts((state) => state.profiles[accountId] ?? accountById(accountId).profile)
}
