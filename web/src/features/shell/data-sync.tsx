"use client"

import { useEffect } from "react"

import { useData } from "@/state/data"

export function DataSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let checking = false
    const refresh = async (initial = false) => {
      if (document.hidden || checking) return
      checking = true
      try {
        const state = useData.getState()
        await (initial ? state.load() : state.sync())
      } finally {
        checking = false
      }
    }
    const start = () => {
      if (timer) clearInterval(timer)
      void refresh()
      timer = setInterval(() => void refresh(), 2_000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer)
        timer = undefined
      } else start()
    }
    void refresh(true)
    timer = setInterval(() => void refresh(), 2_000)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return null
}
