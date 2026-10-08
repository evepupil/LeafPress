"use client"

import { useEffect } from "react"

import type { Version } from "@leafpress/core"
import { ApiError, getJson } from "@/state/api"
import { useData } from "@/state/data"

async function checkVersion(): Promise<void> {
  const version = await getJson<Version>("/api/version")
  await useData.getState().sync(version)
}

export function DataSync() {
  useEffect(() => {
    void useData.getState().load()

    let timer: ReturnType<typeof setInterval> | undefined
    const poll = () => {
      if (document.hidden) return
      void checkVersion().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "连接本机服务失败"
        const hint = error instanceof ApiError ? error.hint : undefined
        useData.setState({ status: "error", error: { message, ...(hint ? { hint } : {}) } })
      })
    }
    const start = () => {
      if (timer) clearInterval(timer)
      poll()
      timer = setInterval(poll, 2_000)
    }
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearInterval(timer)
        timer = undefined
      } else start()
    }
    timer = setInterval(poll, 2_000)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return null
}
