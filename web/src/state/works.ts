"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { accountById } from "@/data/accounts"
import { DEMO_NOW, addMinutes } from "@/data/clock"
import type { IsoTime, Work, WorkStatus } from "@/data/types"
import { WORKS } from "@/data/works"
import { newWorkId, reorderTodo } from "@/lib/board"
import { type ConvertSource, advance, convert, moveTo, submitFeedback, workflowOf } from "@/lib/work-engine"

/**
 * 作品（也是任务）列表。初始值是 src/data 里的作品，改动存在浏览器里（localStorage），刷新不丢；
 * 用户菜单里「恢复初始数据」清掉。推进规则全在 @/lib/work-engine，这里只负责存和定时。
 */

export type WorkPatch = Partial<Pick<Work, "title" | "brief" | "workflowId" | "question" | "url">>
export type ActionResult = { ok: true } | { ok: false; reason: string }

interface WorksState {
  works: Work[]
  /** AI 正在做的作品（页面上「让 AI 做」之后还在走步骤的），不存 */
  running: string[]
  /** 新作品编号的序号，从 101 开始 */
  serial: number
  /** 页面上的时间从演示时刻往后走，每个动作推一分钟 */
  minute: number
  update(id: string, patch: WorkPatch): void
  /** 拖动卡片：挪到某列，排在 beforeId 前面（为空放最后）。挪到进行中等于「让 AI 做」 */
  drop(id: string, status: WorkStatus, beforeId: string | null): ActionResult
  /** 转作品 / 新建：选几个账号生成几个作品，排在待实现最后 */
  create(source: ConvertSource, accountIds: string[], brief: string): Work[]
  /** 让 AI 做：一步一步往下走，停在要你动手的步骤或者做完 */
  runAi(id: string): ActionResult
  /** 提交反馈：回到待实现最前面，等 AI 继续 */
  feedback(id: string, text: string): void
  remove(id: string): void
  reset(): void
}

const FIRST_SERIAL = 101
/** AI 每一步在页面上停多久 */
const STEP_MS = 900

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function minOrder(works: Work[]): number {
  return works.filter((work) => work.status === "todo").reduce((min, work) => Math.min(min, work.order), 1)
}

function maxOrder(works: Work[]): number {
  return works.filter((work) => work.status === "todo").reduce((max, work) => Math.max(max, work.order), 0)
}

export const useWorks = create<WorksState>()(
  persist(
    (set, get) => {
      /** 取一个时间，并把页面时钟往后推 */
      const stamp = (minutes = 1): IsoTime => {
        const minute = get().minute + minutes
        set({ minute })
        return addMinutes(DEMO_NOW, minute)
      }

      const replace = (next: Work) => set((state) => ({ works: state.works.map((work) => (work.id === next.id ? next : work)) }))

      const find = (id: string) => get().works.find((work) => work.id === id)

      const stopTimer = (id: string) => {
        const timer = timers.get(id)
        if (timer) clearTimeout(timer)
        timers.delete(id)
        if (get().running.includes(id)) set((state) => ({ running: state.running.filter((item) => item !== id) }))
      }

      const schedule = (id: string) => {
        timers.set(
          id,
          setTimeout(() => tick(id), STEP_MS),
        )
        if (!get().running.includes(id)) set((state) => ({ running: [...state.running, id] }))
      }

      /** AI 走一步，还在进行中就排下一步 */
      const tick = (id: string) => {
        timers.delete(id)
        const work = find(id)
        if (!work || (work.status !== "doing" && work.status !== "todo")) return stopTimer(id)
        const next = advance(work, stamp(2))
        replace(next)
        if (next.status === "doing") schedule(id)
        else stopTimer(id)
      }

      return {
        works: WORKS,
        running: [],
        serial: FIRST_SERIAL,
        minute: 0,

        update: (id, patch) => {
          if (!find(id)) return
          set((state) => ({
            works: state.works.map((item) =>
              item.id === id ? { ...item, ...patch, updatedAt: addMinutes(DEMO_NOW, state.minute) } : item,
            ),
          }))
        },

        drop: (id, status, beforeId) => {
          const work = find(id)
          if (!work) return { ok: false, reason: "没有这个作品" }
          if (work.status === "done" && status !== "done") return { ok: false, reason: "已完成的作品不能挪回去" }
          if (status === "doing") return work.status === "doing" && timers.has(id) ? { ok: true } : get().runAi(id)
          stopTimer(id)
          let works = get().works
          if (work.status !== status) {
            const moved = moveTo(work, status, stamp(), maxOrder(works) + 1)
            works = works.map((item) => (item.id === id ? moved : item))
          }
          if (status === "todo") {
            const orders = reorderTodo(works, id, beforeId)
            works = works.map((item) => (orders.has(item.id) ? { ...item, order: orders.get(item.id) ?? item.order } : item))
          }
          set({ works })
          return { ok: true }
        },

        create: (source, accountIds, brief) => {
          const { works, serial } = get()
          const ids = accountIds.map((accountId, index) => newWorkId(accountById(accountId).platform, serial + index))
          const created = convert(source, accountIds, brief, stamp(), ids, maxOrder(works) + 1)
          set((state) => ({ works: [...state.works, ...created], serial: state.serial + created.length }))
          return created
        },

        runAi: (id) => {
          const work = find(id)
          if (!work) return { ok: false, reason: "没有这个作品" }
          const workflow = workflowOf(work)
          if (workflow.status === "needs-setup") return { ok: false, reason: workflow.setupHint ?? `「${workflow.name}」还要配置` }
          if (work.status === "waiting") return { ok: false, reason: "这一步要你来做" }
          if (work.status === "done") return { ok: false, reason: "已经完成了" }
          if (timers.has(id)) return { ok: true }
          if (work.status === "todo") tick(id)
          else schedule(id)
          return { ok: true }
        },

        feedback: (id, text) => {
          const work = find(id)
          if (!work) return
          replace(submitFeedback(work, text, stamp(), minOrder(get().works) - 1))
        },

        remove: (id) => {
          stopTimer(id)
          set((state) => ({ works: state.works.filter((work) => work.id !== id) }))
        },

        reset: () => {
          for (const id of [...timers.keys()]) stopTimer(id)
          set({ works: WORKS, running: [], serial: FIRST_SERIAL, minute: 0 })
        },
      }
    },
    {
      name: "leafpress:works",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ works: state.works, serial: state.serial, minute: state.minute }),
      // 首屏先用初始数据渲染，和静态导出的页面一致；挂载后再读浏览器里存的（见 StoreHydration）
      skipHydration: true,
    },
  ),
)
