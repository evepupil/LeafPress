"use client"

import { create } from "zustand"

import { LAST_WEEK } from "@/data/clock"
import type { DayKey } from "@/data/types"

/** 周报正在看哪一周，默认上周 */
export const useReportWeek = create<{ week: DayKey; setWeek(week: DayKey): void }>((set) => ({
  week: LAST_WEEK,
  setWeek: (week) => set({ week }),
}))
