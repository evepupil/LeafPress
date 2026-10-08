"use client"

import { WORKFLOWS, isUsable, workflowUsage } from "@leafpress/core"
import { useMemo, useSyncExternalStore } from "react"

import { useAccounts, useWorks } from "@/state/data"
import { WorkflowCard } from "./cards-item"

function subscribeHash(onChange: () => void): () => void {
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

function useLocationHash(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  )
}

export function WorkflowCards() {
  const works = useWorks()
  const accounts = useAccounts()
  const hash = useLocationHash()
  const usage = useMemo(() => Object.fromEntries(WORKFLOWS.map((workflow) => [workflow.id, workflowUsage(works, workflow.id)])), [works])

  return (
    <section id="workflows" aria-label="发布工作流" className="grid items-start gap-(--gap-card) md:grid-cols-2 2xl:grid-cols-3">
      {WORKFLOWS.map((workflow) => {
        const targets = accounts.filter((account) => workflow.platform === "any" || account.platform === workflow.platform)
        const ready = workflow.requires.length === 0 || targets.some((account) => isUsable(workflow, account.settings))
        return (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            usage={usage[workflow.id] ?? { active: 0, done: 0 }}
            ready={ready}
            highlighted={hash === `#${workflow.id}`}
          />
        )
      })}
    </section>
  )
}

export default WorkflowCards
