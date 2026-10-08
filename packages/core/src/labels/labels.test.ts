import { expect, test } from "vitest"

import {
  DATA_MODE_LABEL,
  IDEA_SOURCE_LABEL,
  IDEA_STATUS_LABEL,
  IDEA_STATUS_ORDER,
  METRIC_LABEL,
  PULL_STATUS_LABEL,
  SETUP_STATE_LABEL,
  SETUP_USE_LABEL,
  SETTING_STATUS_LABEL,
  STAGE_LABEL,
  STEP_KIND_LABEL,
  WORK_STATUS_LABEL,
  WORK_STATUS_ORDER,
} from "./labels.ts"

/** 中文标签都按对象键齐全的类型写，这里确认实际文字和列的顺序 */

test("作品状态和列的顺序", () => {
  expect(WORK_STATUS_LABEL).toEqual({ todo: "待实现", doing: "进行中", waiting: "等你处理", done: "已完成" })
  expect(WORK_STATUS_ORDER).toEqual(["todo", "doing", "waiting", "done"])
})

test("账号和接入的标签", () => {
  expect(STAGE_LABEL).toEqual({ active: "运营中", preparing: "筹备中", paused: "暂停" })
  expect(DATA_MODE_LABEL).toEqual({ api: "平台接口", analytics: "网站统计", crawler: "抓创作中心" })
  expect(PULL_STATUS_LABEL).toEqual({ ok: "正常", failed: "拉取失败", missing: "还没接" })
  expect(SETUP_STATE_LABEL).toEqual({ ready: "接好了", broken: "有问题", unfinished: "没接完" })
  expect(SETUP_USE_LABEL).toEqual({ data: "拉数据用", publish: "投稿用", write: "写稿、发布用" })
})

test("配置项状态：已配置 / 未配置 / 已过期", () => {
  expect(SETTING_STATUS_LABEL).toEqual({ ok: "已配置", missing: "未配置", expired: "已过期" })
})

test("灵感状态、列的顺序和来源", () => {
  expect(IDEA_STATUS_LABEL).toEqual({ inbox: "收件箱", promising: "值得写", converted: "已转作品" })
  expect(IDEA_STATUS_ORDER).toEqual(["inbox", "promising", "converted"])
  expect(IDEA_SOURCE_LABEL.quick).toBe("随手记")
  expect(IDEA_SOURCE_LABEL.devlog).toBe("开发记录")
  expect(IDEA_SOURCE_LABEL.cloudmind).toBe("CloudMind")
  expect(IDEA_SOURCE_LABEL.trend).toBe("热点")
  expect(IDEA_SOURCE_LABEL.bookmark).toBe("收藏")
  expect(IDEA_SOURCE_LABEL.batch).toBe("AI 批量")
  expect(IDEA_SOURCE_LABEL.schedule).toBe("定时跑")
})

test("步骤种类：AI / 自动 / 你来", () => {
  expect(STEP_KIND_LABEL).toEqual({ ai: "AI", code: "自动", manual: "你来" })
})

test("指标名称", () => {
  expect(METRIC_LABEL).toEqual({ followers: "粉丝", reads: "浏览", interactions: "互动", posts: "发布" })
})
