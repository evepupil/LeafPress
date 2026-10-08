import type { Idea, Work, WorkLog } from "@/data/types"
import { formatDay, formatRelative } from "@/lib/format"
import type { ContextSource } from "@/lib/work-engine"

/** 作品详情抽屉里的纯计算：按钮怎么写、什么时候能换工作流、复制给 AI 时附哪个来源、记录怎么排 */

/** 记录先显示最新的几条，其余点「显示全部」 */
export const LOG_PREVIEW = 8

export interface RunLook {
  label: string
  /** AI 正在做：按钮禁用，前面画转圈 */
  busy: boolean
}

/** 「让 AI 做」按钮现在怎么写。只有待实现、进行中的作品才有这个按钮 */
export function runLook(work: Work, running: boolean): RunLook | null {
  if (work.status !== "todo" && work.status !== "doing") return null
  if (running) return { label: "AI 在做", busy: true }
  // 进行中但页面没在跑：外面的 agent 在做，这里接着往下走
  if (work.status === "doing") return { label: "接着做", busy: false }
  return { label: work.feedback ? "让 AI 继续" : "让 AI 做", busy: false }
}

/** 工作流只有还没开始的待实现作品才能换 */
export function workflowLocked(work: Work): boolean {
  return !(work.status === "todo" && work.step === 0)
}

function sourceOf(work: Work): ContextSource {
  return { title: work.title, ...(work.url ? { url: work.url } : {}), ...(work.localPath ? { localPath: work.localPath } : {}) }
}

/**
 * 复制给 AI 的说明里「来源」写谁：
 * 来源是作品就写那个作品（标题、链接、本机原稿）；来源是灵感就写灵感那句话；导入的博客写它自己；新建的不写。
 * 来源已经被删掉时也不写。
 */
export function contextSourceOf(work: Work, works: Work[], ideas: Idea[]): ContextSource | undefined {
  const source = work.source
  switch (source.kind) {
    case "work": {
      const origin = works.find((item) => item.id === source.workId)
      return origin ? sourceOf(origin) : undefined
    }
    case "idea": {
      const idea = ideas.find((item) => item.id === source.ideaId)
      return idea ? { title: idea.text } : undefined
    }
    case "import":
      return sourceOf(work)
    case "none":
      return undefined
  }
}

export interface LogRow {
  entry: WorkLog
  /** 它在原记录里的位置，当 key 用（新记录总是加在最后，位置不会变） */
  index: number
}

/** 记录按时间倒序；同一时刻写下的，后写的排前面 */
export function newestFirst(log: WorkLog[]): LogRow[] {
  return log.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.at.localeCompare(a.entry.at) || b.index - a.index)
}

/** 属性里的「时间」：创建多久以前；已完成的再加发布日 */
export function timeText(work: Work): string {
  const created = `创建 ${formatRelative(work.createdAt)}`
  return work.status === "done" && work.publishedAt ? `${created} · 发布 ${formatDay(work.publishedAt)}` : created
}
