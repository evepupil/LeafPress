import { describe, expect, it } from "vitest"

import type { BootstrapScheduleView } from "@leafpress/core"
import { dataPullWhen, listedSchedules } from "./schedules"

function schedule(patch: Partial<BootstrapScheduleView> = {}): BootstrapScheduleView {
  return {
    id: "data-pull",
    name: "拉作品数据",
    summary: "每天拉一次各账号的数据；拿数据的工具还没做的平台跳过。",
    when: "每天 06:00",
    installed: false,
    ...patch,
  }
}

describe("定时工作流要列出哪些", () => {
  it("拉作品数据没装也要列，用来告诉用户怎么装", () => {
    expect(listedSchedules([schedule({ installed: false })]).map((item) => item.id)).toEqual(["data-pull"])
  })

  it("其余的定时工作流没装就不列", () => {
    const harvest = schedule({ id: "idea-harvest", name: "跑灵感", when: "每天 08:00", installed: false })
    expect(listedSchedules([schedule({ installed: true }), harvest]).map((item) => item.id)).toEqual(["data-pull"])
  })

  it("其余的定时工作流装上了就列，顺序不变", () => {
    const harvest = schedule({ id: "idea-harvest", name: "跑灵感", when: "每天 08:00", installed: true })
    expect(listedSchedules([schedule({ installed: true }), harvest]).map((item) => item.id)).toEqual(["data-pull", "idea-harvest"])
  })

  it("服务端没有给任何定时工作流时列表为空，整块不显示", () => {
    expect(listedSchedules([])).toEqual([])
  })
})

describe("什么时候拉", () => {
  it("装上了：给出每天几点", () => {
    expect(dataPullWhen([schedule({ installed: true, when: "每天 06:30" })])).toBe("每天 06:30")
  })

  it("没装：服务端照样给了 when，也不能当成每天在拉", () => {
    expect(dataPullWhen([schedule({ installed: false, when: "每天 06:00" })])).toBeUndefined()
  })

  it("没有拉作品数据这一项：没有时间", () => {
    expect(dataPullWhen([])).toBeUndefined()
    expect(dataPullWhen([schedule({ id: "idea-harvest", installed: true })])).toBeUndefined()
  })
})
