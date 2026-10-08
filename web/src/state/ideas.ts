"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { DEMO_NOW, addMinutes } from "@/data/clock"
import { HARVEST_POOL, IDEAS } from "@/data/ideas"
import type { Idea, IdeaSource, IdeaStatus } from "@/data/types"
import { reorderIdeas, sortIdeas } from "@/lib/board"

/**
 * 灵感列表：灵感页、速记、侧栏计数共用。初始值是 src/data 里的灵感，改动存在浏览器里，刷新不丢。
 * 转作品走 @/state/actions 的 convertToWorks（要同时改作品和灵感）。
 */

export type IdeaPatch = Partial<Pick<Idea, "text" | "detail" | "accountId">>

interface IdeasState {
  ideas: Idea[]
  /** 新灵感编号的序号，从 21 开始 */
  serial: number
  /** 「跑灵感」已经放进来几条 */
  harvested: number
  minute: number
  /** 新灵感放在收件箱最前面 */
  add(input: { text: string; detail?: string; accountId?: string; source: IdeaSource; sourceDetail?: string }): Idea
  update(id: string, patch: IdeaPatch): void
  /** 拖动卡片：挪到收件箱或值得写，排在 beforeId 前面（为空放最后）。已转作品的不能拖 */
  drop(id: string, status: Exclude<IdeaStatus, "converted">, beforeId: string | null): void
  /** 转成作品后记下作品编号，挪到已转作品最前面 */
  linkWorks(id: string, workIds: string[]): void
  remove(id: string): void
  /** 跑灵感：最多放 2 条新的进收件箱，返回放进来的 */
  harvest(): Idea[]
  reset(): void
}

const FIRST_SERIAL = 21

export const useIdeas = create<IdeasState>()(
  persist(
    (set, get) => {
      const stamp = () => {
        const minute = get().minute + 1
        set({ minute })
        return addMinutes(DEMO_NOW, minute)
      }

      const topOrder = (status: IdeaStatus) => sortIdeas(get().ideas, status).reduce((min, idea) => Math.min(min, idea.order), 1) - 1

      const insert = (input: Omit<Idea, "id" | "order" | "createdAt" | "status" | "workIds">): Idea => {
        const idea: Idea = {
          ...input,
          id: `i-${get().serial}`,
          status: "inbox",
          order: topOrder("inbox"),
          createdAt: stamp(),
          workIds: [],
        }
        set((state) => ({ ideas: [idea, ...state.ideas], serial: state.serial + 1 }))
        return idea
      }

      return {
        ideas: IDEAS,
        serial: FIRST_SERIAL,
        harvested: 0,
        minute: 0,

        add: (input) =>
          insert({
            text: input.text.trim(),
            detail: input.detail?.trim() ?? "",
            source: input.source,
            ...(input.sourceDetail ? { sourceDetail: input.sourceDetail } : {}),
            ...(input.accountId ? { accountId: input.accountId } : {}),
          }),

        update: (id, patch) => set((state) => ({ ideas: state.ideas.map((idea) => (idea.id === id ? { ...idea, ...patch } : idea)) })),

        drop: (id, status, beforeId) => {
          const idea = get().ideas.find((item) => item.id === id)
          if (!idea || idea.status === "converted") return
          const moved = get().ideas.map((item) => (item.id === id ? { ...item, status } : item))
          const orders = reorderIdeas(moved, id, status, beforeId)
          set({ ideas: moved.map((item) => (orders.has(item.id) ? { ...item, order: orders.get(item.id) ?? item.order } : item)) })
        },

        linkWorks: (id, workIds) => {
          const order = topOrder("converted")
          set((state) => ({
            ideas: state.ideas.map((idea) =>
              idea.id === id ? { ...idea, status: "converted", order, workIds: [...idea.workIds, ...workIds] } : idea,
            ),
          }))
        },

        remove: (id) => set((state) => ({ ideas: state.ideas.filter((idea) => idea.id !== id) })),

        harvest: () => {
          const { harvested } = get()
          const batch = HARVEST_POOL.slice(harvested, harvested + 2)
          const added = batch.map((item) => insert({ ...item, source: "schedule" }))
          set((state) => ({ harvested: state.harvested + batch.length }))
          return added
        },

        reset: () => set({ ideas: IDEAS, serial: FIRST_SERIAL, harvested: 0, minute: 0 }),
      }
    },
    {
      name: "leafpress:ideas",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ideas: state.ideas, serial: state.serial, harvested: state.harvested, minute: state.minute }),
      skipHydration: true,
    },
  ),
)
