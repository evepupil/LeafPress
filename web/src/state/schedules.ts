"use client"

import type { BootstrapScheduleView } from "@leafpress/core"

import { useSchedules } from "./data"

/**
 * 工作流页「定时工作流」要列出的：拉作品数据没装也要列（得告诉用户怎么装上），
 * 其余的定时工作流装上了才列。列表为空时那一块整块不显示。
 */
export function listedSchedules(schedules: BootstrapScheduleView[]): BootstrapScheduleView[] {
  return schedules.filter((item) => item.installed || item.id === "data-pull")
}

/**
 * 「什么时候拉」：只有拉作品数据的计划任务装上了才有。本机服务不管装没装都会给出 when（每天 06:00），
 * 没装时写出来会让人以为每天都在拉，所以这里按 installed 过滤，交给共享规则 setupView 去算各账号的 schedule。
 */
export function dataPullWhen(schedules: BootstrapScheduleView[]): string | undefined {
  const schedule = schedules.find((item) => item.id === "data-pull")
  return schedule?.installed ? schedule.when : undefined
}

export function useDataPullWhen(): string | undefined {
  return dataPullWhen(useSchedules())
}
