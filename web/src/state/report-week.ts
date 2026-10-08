"use client"

import { addDays, dayOfDate, weekStartOf, type DayKey } from "@leafpress/core"
import { create } from "zustand"

function initialWeek(): DayKey {
  return addDays(weekStartOf(dayOfDate(new Date())), -7)
}

/** 周报正在看的周仅保存在内存中。 */
export const useReportWeek = create<{ week: DayKey; setWeek(week: DayKey): void }>((set) => ({
  week: initialWeek(),
  setWeek: (week) => set({ week }),
}))
