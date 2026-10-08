"use client"

import { useMemo, useSyncExternalStore } from "react"

import { WORKFLOWS } from "@/data/workflows"
import { workflowUsage } from "@/lib/board"
import { useWorks } from "@/state/works"
import { WorkflowCard } from "./cards-item"

function subscribeHash(onChange: () => void): () => void {
  // 站内跳转（点自动配规则里的链接、⌘K 选工作流）走 pushState，不会触发 hashchange；
  // 支持 Navigation API 的浏览器会在地址栏变化时发 currententrychange（类型库里还没有它，只声明用到的部分）。
  // pushState 是在 React 提交的中途调用的，那时不能排更新，所以推迟到这一轮结束后再读
  const navigation = (window as Window & { navigation?: EventTarget }).navigation
  const onEntryChange = () => queueMicrotask(onChange)
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  navigation?.addEventListener("currententrychange", onEntryChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
    navigation?.removeEventListener("currententrychange", onEntryChange)
  }
}

/**
 * 地址栏里的锚点（#blog-to-zhihu），用来给被指到的那张卡加焦点环。写法同侧栏：
 * 每次渲染都换一个新的读取函数，让 React 在提交后重新读一遍，地址栏比渲染晚更新的那一帧也能补上。
 */
function useLocationHash(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  )
}

/** 发布工作流：每个工作流一张卡，看每一步是 AI、自动还是要你动手 */
export function WorkflowCards() {
  const works = useWorks((state) => state.works)
  const hash = useLocationHash()
  // 每个工作流有多少作品在用、多少已完成，跟着页面上的作品变
  const usage = useMemo(() => Object.fromEntries(WORKFLOWS.map((workflow) => [workflow.id, workflowUsage(works, workflow.id)])), [works])

  return (
    <section id="workflows" aria-label="发布工作流" className="grid items-start gap-(--gap-card) md:grid-cols-2 2xl:grid-cols-3">
      {WORKFLOWS.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} usage={usage[workflow.id]} highlighted={hash === `#${workflow.id}`} />
      ))}
    </section>
  )
}

export default WorkflowCards
