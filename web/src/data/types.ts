/**
 * 演示数据的形状。页面只认这些类型；换成真数据时字段名不动，只换 src/data 里的值。
 */

/** 日历日，YYYY-MM-DD（北京时间） */
export type DayKey = string
/** 带时区的时间，例如 2026-10-08T06:00:00+08:00 */
export type IsoTime = string

/** 标签色：只落在小色点、平台标识这类小面积上 */
export type LabelColor = "red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "violet" | "pink" | "gray"

export type PlatformId = "blog" | "zhihu" | "wechat" | "bilibili" | "xiaohongshu"

export interface Platform {
  id: PlatformId
  name: string
  /** 平台标识方块里的一个字 */
  glyph: string
  color: LabelColor
}

export type AccountStage = "active" | "preparing" | "paused"

/** 栏目：一个账号下固定的内容方向 */
export interface Column {
  id: string
  name: string
  /** 计划占比 0～1，同一个账号的栏目加起来等于 1 */
  targetShare: number
  color: LabelColor
}

export interface Benchmark {
  name: string
  platform: PlatformId | "web"
  note: string
}

/** 数据怎么来：平台接口、网站统计、手填 */
export type DataMode = "api" | "analytics" | "manual"
export type PullResult = "ok" | "failed" | "never"

export interface DataSource {
  mode: DataMode
  /** 给人看的来源名，例如「知乎数据开放平台」 */
  provider: string
  /** 什么时候拉 / 什么时候填 */
  schedule: string
  lastPullAt?: IsoTime
  lastResult: PullResult
  failReason?: string
  fixHint?: string
}

export interface Account {
  id: string
  platform: PlatformId
  name: string
  handle: string
  url: string
  stage: AccountStage
  since: DayKey
  /** 「粉丝」在这个平台叫什么：关注者、用户、粉丝、订阅 */
  audienceLabel: string
  /** 「阅读」在这个平台叫什么：阅读、访问、播放、浏览 */
  readsLabel: string
  /** 定位：一句话 */
  positioning: string
  /** 写给谁看 */
  audience: string[]
  columns: Column[]
  /** 文风规矩 */
  styleRules: string[]
  /** 禁用的句式和词 */
  bannedPhrases: string[]
  benchmarks: Benchmark[]
  goals: { followers: number; by: DayKey; postsPerWeek: number }
  /** 方向调整记录，新的在前 */
  directionLog: { date: DayKey; note: string }[]
  dataSource: DataSource
  /** 筹备清单，只有筹备中的号才有 */
  prep?: { label: string; done: boolean }[]
}

/** 作品状态：灵感 → 在写 → 待发 → 已发（任何一个平台发出就算已发） */
export type WorkStatus = "idea" | "writing" | "ready" | "published"
/** 版本的形态：长文、回答、短帖、视频、图文卡片 */
export type PubFormat = "article" | "answer" | "post" | "video" | "cards"
/** 版本状态：已发、等回填链接、已排期、草稿 */
export type PubState = "published" | "pending-link" | "scheduled" | "draft"

/** 一个作品在某个账号上的一个版本 */
export interface Publication {
  id: string
  workId: string
  accountId: string
  columnId: string
  format: PubFormat
  state: PubState
  url?: string
  publishedAt?: DayKey
  plannedFor?: DayKey
  /** 回答挂在哪个问题下 */
  question?: string
  /** 截至昨天的累计数据，只有已发的版本才有 */
  totals?: { reads: number; likes: number; comments: number; collects: number }
}

export interface Work {
  id: string
  title: string
  status: WorkStatus
  /** 主账号：作品最先发在哪个号 */
  accountId: string
  columnId: string
  tags: string[]
  createdAt: DayKey
  updatedAt: DayKey
  /** 博客原稿，例如 zh/chatgpt-mcp-3a94342e */
  sourceRef?: string
  /** 原稿最初写在哪 */
  origin: "notion" | "repo" | "zhihu-writing" | "pipeline" | "idea"
  /** 正文字数（不含空白） */
  words?: number
  images?: number
  codeBlocks?: number
  note?: string
  /** 由哪次工具运行产出或正在处理 */
  runId?: string
}

/** 一个账号一天的数据 */
export interface DailyPoint {
  day: DayKey
  /** 当天结束时的粉丝数 */
  followers: number
  reads: number
  /** 赞同、收藏、评论加起来 */
  interactions: number
  /** 当天发出的版本数 */
  posts: number
}

export type IdeaStatus = "inbox" | "promising" | "scheduled" | "converted" | "shelved"
/** 灵感从哪来：随手记、开发记录、CloudMind 记忆、收藏、热点 */
export type IdeaSource = "quick" | "devlog" | "cloudmind" | "bookmark" | "trend"

export interface Idea {
  id: string
  text: string
  status: IdeaStatus
  source: IdeaSource
  /** 来源补充：哪个项目、哪条记忆、哪个链接 */
  sourceDetail?: string
  accountId?: string
  columnId?: string
  createdAt: IsoTime
  /** 已转成的作品 */
  workId?: string
}

export type MaterialKind = "progress" | "review" | "commit"

/** 从开发记录里收来的候选素材 */
export interface DevMaterial {
  id: string
  project: string
  kind: MaterialKind
  title: string
  excerpt: string
  date: DayKey
  path: string
}

export interface Bookmark {
  id: string
  title: string
  url: string
  platform: PlatformId | "web"
  note: string
  savedAt: DayKey
}

export type ToolStatus = "ready" | "needs-setup" | "planned"
export type ToolIcon = "send" | "message" | "pen" | "notebook" | "images" | "newspaper" | "video" | "cards" | "download" | "report"

export interface Tool {
  id: string
  name: string
  icon: ToolIcon
  summary: string
  steps: string[]
  /** 在 Claude Code 里怎么说 */
  say: string
  /** 命令行写法 */
  command?: string
  status: ToolStatus
  setupHint?: string
  platforms: PlatformId[]
  /** 产出什么 */
  outputs: string
  /** 定时跑的写在这里 */
  schedule?: string
}

/** 步骤种类：代码、AI、作者确认、交给外部工具、作者手动 */
export type StepKind = "code" | "ai" | "confirm" | "handoff" | "manual"
export type StepState = "done" | "running" | "waiting" | "failed" | "pending"

export interface RunStep {
  name: string
  kind: StepKind
  state: StepState
  note?: string
  at?: IsoTime
}

export type RunState = "waiting" | "running" | "done" | "failed"

/** 一次工具运行 */
export interface ToolRun {
  id: string
  toolId: string
  title: string
  state: RunState
  startedAt: IsoTime
  finishedAt?: IsoTime
  steps: RunStep[]
  /** 等你做什么（等待中才有） */
  waitingFor?: string
  /** 按钮文字，例如「回填链接」 */
  actionLabel?: string
  error?: string
  workId?: string
}

/** 每周复盘笔记 */
export interface WeeklyNote {
  week: DayKey
  wins: string
  improve: string
  next: string
}
