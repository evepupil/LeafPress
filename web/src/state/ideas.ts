"use client"

import { create } from "zustand"

import { DEMO_NOW } from "@/data/clock"
import { IDEAS } from "@/data/ideas"
import type { Idea, IdeaSource, IdeaStatus } from "@/data/types"

/** 灵感列表：总览的速记、灵感页、侧栏计数共用。初始值是演示数据，刷新复原 */
interface IdeasState {
  ideas: Idea[]
  /** 新灵感放在最前面，编号 new-1、new-2……，createdAt 用演示时刻，status 为 inbox */
  add(input: { text: string; accountId?: string; columnId?: string; source: IdeaSource; sourceDetail?: string }): Idea
  move(id: string, status: IdeaStatus): void
  /** 转成作品：status 改 converted，workId 填 w-new-<编号> */
  convert(id: string): void
}

let counter = 0

export const useIdeas = create<IdeasState>((set) => ({
  ideas: IDEAS,
  add: (input) => {
    counter += 1
    const idea: Idea = {
      id: `new-${counter}`,
      text: input.text,
      status: "inbox",
      source: input.source,
      createdAt: DEMO_NOW,
      ...(input.sourceDetail ? { sourceDetail: input.sourceDetail } : {}),
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.columnId ? { columnId: input.columnId } : {}),
    }
    set((state) => ({ ideas: [idea, ...state.ideas] }))
    return idea
  },
  move: (id, status) =>
    set((state) => ({
      ideas: state.ideas.map((idea) => (idea.id === id ? { ...idea, status } : idea)),
    })),
  convert: (id) =>
    set((state) => ({
      ideas: state.ideas.map((idea) => (idea.id === id ? { ...idea, status: "converted", workId: `w-new-${id}` } : idea)),
    })),
}))
