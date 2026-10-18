import type { DayKey, IsoTime } from "./common.ts"
import type { PlatformId } from "./platform.ts"

/**
 * 灵感候选：跑灵感时代码从各来源找来、去过重、排好序的选题，等 AI 挑。
 * AI 挑中的变成灵感（已推），没挑中的跳过；作者删掉由它变来的灵感，它就标成不要，以后再也不推。
 * 规则见 docs/模块设计/灵感-跑灵感.md。
 */

/** 候选从哪来：知乎问题、已发作品的续写、开发记录 */
export type CandidateKind = "question" | "followup" | "devlog"

/**
 * 候选的状态：
 * - new：在候选池里，等 AI 挑；
 * - suggested：AI 挑中，已经变成灵感（ideaId）；
 * - skipped：AI 看过没挑，14 天内不再进池（之后再被找到时回到 new）；
 * - rejected：作者删掉了由它变来的灵感，以后再也不推。
 */
export type CandidateState = "new" | "suggested" | "skipped" | "rejected"

/** 知乎问题是怎么找到的：按作者账号画像推荐、按主题词推荐、按博客标题反找、热榜里命中主题词 */
export type QuestionVia = "personal" | "topic" | "blog" | "hot"

export interface QuestionPayload {
  kind: "question"
  questionId: string
  /** 同一个问题被几种方式找到时都记下，按 personal、topic、blog、hot 的顺序 */
  via: QuestionVia[]
  /** via 含 topic 时命中的主题词（几个就记几个） */
  topics: string[]
  /** via 含 blog 时对得上的博客作品编号 */
  blogWorkIds: string[]
  /** 已有回答的摘要（接口给的截取文本，每条最多 200 字，最多 3 条）；没查或查失败时为空 */
  answerSummaries: string[]
  /** 标题和作者自己的作品对得上的（按相似度从高到低，最多 3 个作品编号） */
  relatedWorkIds: string[]
}

export interface FollowupPayload {
  kind: "followup"
  workId: string
  platform: PlatformId
  publishedAt?: DayKey
  /** 累计主数据（阅读或访问） */
  reach: number
  /** 近 7 天主数据的增长（和数据页作品排行的「近 7 天」同一个算法） */
  growth: number
  /** 累计互动；第二个数不是互动的平台（博客是访客）为 null */
  interactions: number | null
}

export interface DevlogPayload {
  kind: "devlog"
  /** 项目文件夹名 */
  repo: string
  /** 项目文件夹的绝对路径 */
  path: string
  /** ISO 周，形如 2026-W42 */
  week: string
  /** 这段时间的提交说明（新的在前，最多 30 条） */
  commits: string[]
  /** 这段时间的进度流水：文件名和里面的二级标题（最多 10 个文件） */
  logs: { file: string; headings: string[] }[]
}

export type CandidatePayload = QuestionPayload | FollowupPayload | DevlogPayload

export interface IdeaCandidate {
  /** c-<序号> */
  id: string
  /** 去重用的键：zq:<问题编号>、wf:<作品编号>、dev:<规范化的项目路径>:<ISO 周>（路径转小写、反斜杠换成 /） */
  key: string
  kind: CandidateKind
  /** 问题标题、作品标题、项目名 */
  title: string
  /** 问题链接、作品链接；开发记录没有 */
  url?: string
  /** 倾向发在哪个账号：知乎问题挂找到它的知乎账号；其余为空 */
  accountId?: string
  /** 同一类候选里排先后用，大的在前；不同类之间不比较 */
  score: number
  state: CandidateState
  /** 已推、不要时：它变成的那条灵感 */
  ideaId?: string
  payload: CandidatePayload
  firstSeenAt: IsoTime
  /** 最近一次状态变化或被重新找到的时间 */
  updatedAt: IsoTime
}

/** 跑一次灵感的结果：每个来源找到几条、新进池几条、出了什么问题 */
export interface GatherSourceReport {
  /** 给人看的来源名：知乎个性化推荐、知乎主题推荐、博客反找问题、知乎热榜、已发作品、开发记录 */
  name: string
  /** 这个来源找到的条数（去重前） */
  found: number
  /** 去重后新进池的条数 */
  added: number
  /** 这个来源没跑成或只跑了一部分的原因（额度用完、密钥失效、没有知乎账号……） */
  warning?: string
}

export interface GatherReport {
  sources: GatherSourceReport[]
  /** 跑完后候选池里所有 new 的候选：问题、续写、开发记录三类各自按 score 从高到低 */
  pool: IdeaCandidate[]
}
