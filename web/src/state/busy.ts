"use client"

import { create } from "zustand"

/**
 * 正在跑的长请求（导入文章、拉数据可能要几十秒）。
 * 放在全局而不是组件里：用户切到别的页面再切回来，或者从另一个按钮又点一次，
 * 组件重新挂载后本地状态已经丢了，只有全局的记录还知道这件事没做完。
 */
interface BusyState {
  active: ReadonlySet<string>
}

const useBusyStore = create<BusyState>(() => ({ active: new Set<string>() }))

/** 这件事现在是不是正在跑，用来让按钮显示加载并禁用 */
export function useBusy(key: string): boolean {
  return useBusyStore((state) => state.active.has(key))
}

export function isBusy(key: string): boolean {
  return useBusyStore.getState().active.has(key)
}

/**
 * 跑一件事，期间这个键一直算忙。同一个键已经在跑时不再开第二个，直接返回 undefined；
 * 不管成功还是失败，结束时都放开，按钮不会卡死。
 */
export async function runBusy<T>(key: string, task: () => Promise<T>): Promise<T | undefined> {
  if (isBusy(key)) return undefined
  useBusyStore.setState((state) => ({ active: new Set(state.active).add(key) }))
  try {
    return await task()
  } finally {
    useBusyStore.setState((state) => {
      const next = new Set(state.active)
      next.delete(key)
      return { active: next }
    })
  }
}
