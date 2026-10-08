/**
 * 演示数据的形状。页面只认这些类型；换成真数据时字段名不动，只换 src/data 里的值。
 *
 * 核心关系：
 *   灵感 ──转作品（选几个平台）──► 作品（一个作品只对应一个平台、一个账号）
 *   作品 ──按平台和来源自动配──► 工作流（一串步骤，有的步骤要你动手）
 *   作品的中间产物、要你做的事、你的反馈都放在它的任务文件夹里，任何 agent 读这个文件夹就能接着干。
 */

/** 日历日，YYYY-MM-DD（北京时间） */
export type DayKey = string
/** 带时区的时间，例如 2026-10-08T06:00:00+08:00 */
export type IsoTime = string

/** 标签色：只落在小色点、平台标识这类小面积上 */
export type LabelColor = "red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "violet" | "pink" | "gray"

export type PlatformId = "blog" | "zhihu" | "bilibili" | "xiaohongshu"

/** 平台上一个作品的一项数据，例如知乎的「浏览」「点赞」，B站的「投币」「弹幕」 */
export interface MetricDef {
  key: string
  label: string
  /** 算不算互动：合计「互动」时把这些加起来 */
  interaction: boolean
}

export interface Platform {
  id: PlatformId
  name: string
  /** 平台标识方块里的一个字 */
  glyph: string
  color: LabelColor
  /** 这个平台的作品有哪些数据。各平台不一样；第一项是主数据（浏览、访问、播放） */
  metrics: MetricDef[]
}

export type AccountStage = "active" | "preparing" | "paused"

/** 数据怎么拿：平台接口、网站统计、登录后抓创作中心页面。没有手填：要手填还不如自己去平台上看 */
export type DataMode = "api" | "analytics" | "crawler"
/** 拉得怎么样：正常、拉取失败、还没接（拿数据的工具还没做） */
export type PullStatus = "ok" | "failed" | "missing"

/** 数据获取：接一个平台要做的两件事之一（另一件是作品产出的工作流） */
export interface DataSource {
  mode: DataMode
  /** 给人看的来源名，例如「知乎数据开放平台」 */
  provider: string
  /** 什么时候拉 */
  schedule: string
  status: PullStatus
  lastPullAt?: IsoTime
  failReason?: string
  fixHint?: string
  /** 还没接时打算怎么拿 */
  plan?: string
}

/** 一个账号接得怎么样：接好了、有问题（原来能用的坏了，比如密钥过期、拉取失败）、没接完（还缺工具或配置） */
export type SetupState = "ready" | "broken" | "unfinished"

/** 接这个平台的账号要配的一样东西，例如博客仓库路径、Umami 密钥、biliup 登录 */
export interface SetupItem {
  key: string
  label: string
  /** 现在的值；密钥类只存「已配置」的事实，界面上不显示原文 */
  value?: string
  secret?: boolean
  status: "ok" | "missing" | "expired"
  /** 用在哪：拉数据、投稿、写稿。拉数据要的配好了，「现在拉一次」才拉得到 */
  usedFor?: "data" | "publish" | "write"
}

export interface Account {
  id: string
  platform: PlatformId
  name: string
  handle: string
  url: string
  stage: AccountStage
  since: DayKey
  /** 「粉丝」在这个平台叫什么：关注者、粉丝、订阅 */
  audienceLabel: string
  /** 主数据在这个平台叫什么：浏览、访问、播放 */
  readsLabel: string
  /**
   * 账号档案：一份随便写的 Markdown。定位、写给谁、文风、禁用词、对标、目标……想写什么写什么，
   * agent 写稿前整份读，就知道这个号是干什么的。以后放在 ~/.leafpress/accounts/<编号>.md
   */
  profile: string
  dataSource: DataSource
  /** 接这个平台的账号要配的东西（作品产出的工作流按平台取，见 workflowsFor） */
  setup: SetupItem[]
}

/** 作品状态：待实现（AI 的待做）→ 进行中（AI 在做）→ 等你处理 → 已完成 */
export type WorkStatus = "todo" | "doing" | "waiting" | "done"

/** 作品从哪来 */
export type WorkSource =
  | { kind: "idea"; ideaId: string }
  /** 由另一个作品转来，例如博客文章转知乎 */
  | { kind: "work"; workId: string }
  /** 从博客仓库导入的已有文章 */
  | { kind: "import" }
  /** 直接新建 */
  | { kind: "none" }

/** 截至昨天的累计数据，只有已完成（已发布）的作品才有。键是平台数据项的 key（见 Platform.metrics） */
export type WorkTotals = Record<string, number>

/** 作品里的一条记录 */
export interface WorkLog {
  at: IsoTime
  text: string
}

/** 一个作品 = 一个平台上的一份内容，也是一条任务 */
export interface Work {
  id: string
  title: string
  /** 发在哪个账号；平台由账号决定 */
  accountId: string
  status: WorkStatus
  /** 要写什么、有什么要求。AI 从这里读 */
  brief: string
  source: WorkSource
  /** 用哪个工作流（创建时按平台和来源自动配，可以改） */
  workflowId: string
  /** 工作流走到第几步（0 起）；已完成时等于步骤总数 */
  step: number
  /** 等你处理时：要你做的事 */
  ask?: string
  /** 你提交的反馈（等 AI 继续时读） */
  feedback?: string
  /** 待实现一列里的先后，小的在前，AI 按这个顺序挑 */
  order: number
  createdAt: IsoTime
  updatedAt: IsoTime
  /** 发布后的地址 */
  url?: string
  publishedAt?: DayKey
  totals?: WorkTotals
  /** 回答挂的问题 */
  question?: string
  /** 博客原稿在本机的位置 */
  localPath?: string
  /** 博客原稿 ref，例如 zh/chatgpt-mcp-3a94342e */
  sourceRef?: string
  /** Notion 同步来的还是直接写在仓库里 */
  origin?: "notion" | "repo"
  tags: string[]
  words?: number
  images?: number
  codeBlocks?: number
  log: WorkLog[]
}

/** 步骤种类：AI 做、代码做、要你动手 */
export type StepKind = "ai" | "code" | "manual"

export interface WorkflowStep {
  name: string
  kind: StepKind
  /** 用到的工具 */
  tool?: string
  /** 这一步在任务文件夹里留下的文件 */
  produces?: string[]
  /** 要你动手的步骤：写给你的话，{folder} 换成任务文件夹 */
  ask?: string
}

export type WorkflowStatus = "ready" | "needs-setup"

/** 发布工作流：把一个作品做出来并发到一个平台 */
export interface Workflow {
  id: string
  name: string
  platform: PlatformId
  /** 从什么来：灵感、博客作品、什么都行 */
  from: "idea" | "blog-work" | "any"
  summary: string
  steps: WorkflowStep[]
  /** 最后一步能不能自动发布 */
  autoPublish: boolean
  status: WorkflowStatus
  setupHint?: string
  /** 在 agent 里怎么说 */
  say: string
}

/** 定时工作流 */
export interface ScheduledWorkflow {
  id: string
  name: string
  summary: string
  schedule: string
  steps: string[]
  lastRunAt: IsoTime
  lastResult: "ok" | "failed"
  lastNote: string
}

/** 工作流用到的工具 */
export interface Tool {
  name: string
  kind: "skill" | "cli" | "api" | "code"
  note: string
  status: "ready" | "needs-setup"
}

/** 一个账号一天的数据 */
export interface DailyPoint {
  day: DayKey
  /** 当天结束时的粉丝数 */
  followers: number
  reads: number
  /** 赞同、收藏、评论加起来 */
  interactions: number
  /** 当天发布的作品数 */
  posts: number
}

/** 灵感状态：收件箱 → 值得写 → 已转作品 */
export type IdeaStatus = "inbox" | "promising" | "converted"
/** 灵感从哪来：随手记、开发记录、CloudMind 记忆、热点、收藏、AI 批量、定时工作流 */
export type IdeaSource = "quick" | "devlog" | "cloudmind" | "trend" | "bookmark" | "batch" | "schedule"

export interface Idea {
  id: string
  /** 一句话 */
  text: string
  /** 细节：想写什么、素材在哪 */
  detail: string
  status: IdeaStatus
  source: IdeaSource
  /** 来源补充：哪个项目、哪条记忆、哪个链接 */
  sourceDetail?: string
  /** 倾向发在哪个账号（可选） */
  accountId?: string
  /** 列里的先后，小的在前 */
  order: number
  createdAt: IsoTime
  /** 转出去的作品 */
  workIds: string[]
}

/** 每周复盘笔记 */
export interface WeeklyNote {
  week: DayKey
  wins: string
  improve: string
  next: string
}
