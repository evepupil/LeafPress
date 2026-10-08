"use client"

import { dayOf, dayOfDate, toIsoTime, type DayKey, type IsoTime } from "@leafpress/core"
import { useSyncExternalStore } from "react"

let current: IsoTime | undefined
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function tick() {
  current = toIsoTime(new Date())
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    tick()
    timer = setInterval(tick, 30_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function snapshot(): IsoTime | undefined {
  return current
}

function serverSnapshot(): undefined {
  return undefined
}

export function useNow(): IsoTime | undefined {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

export function useToday(): DayKey {
  const now = useNow()
  return now ? dayOf(now) : dayOfDate(new Date())
}
