"use client"

import { reportWeeks, weekReport } from "@leafpress/core"
import { useMemo } from "react"

import { useMetricsInput, useNotes, useToday } from "@/state/data"
import { useReportWeek } from "@/state/report-week"

export function useSelectedReport() {
  const today = useToday()
  const available = useMemo(() => reportWeeks(today), [today])
  const selected = useReportWeek((state) => state.week)
  const setWeek = useReportWeek((state) => state.setWeek)
  const week = available.includes(selected) ? selected : (available[1] ?? available[0] ?? today)
  const metrics = useMetricsInput()
  const notes = useNotes()
  const report = useMemo(() => (metrics ? weekReport({ ...metrics, notes }, week) : undefined), [metrics, notes, week])
  return { week, setWeek, weeks: available, report, today, metrics, notes }
}
