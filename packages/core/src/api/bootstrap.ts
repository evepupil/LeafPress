import type { Account, DayKey, Idea, IsoTime, PullRecord, ScheduleView, WeeklyNote, Work } from "../types/index.ts"

/** 变更序号：网页每 2 秒问一次（GET /api/version），有变化才重新取 */
export interface Version {
  /** 记录库里任何数据改了就加一 */
  seq: number
  /** 数据快照改了（拉了一次数据）就加一；网页只在它变了时重取 GET /api/dataset */
  snapshotSeq: number
  /** 账号档案文件里最晚的修改时间（毫秒）；agent 直接改了档案文件，网页也能跟着变 */
  profilesStamp: number
}

/** 数据目录里的几个位置（绝对路径），页面上显示、复制用 */
export interface DataPaths {
  home: string
  tasks: string
  accounts: string
  backups: string
}

/**
 * bootstrap 里的定时任务：在 ScheduleView 上多带装上的时间。
 * 「装上以后一直没运行过」的任务没有 lastRunAt，提醒规则靠装上的时间判断是不是已经晚了
 */
export interface BootstrapScheduleView extends ScheduleView {
  /** 装上的时间；计划任务状态里没记时没有 */
  installedAt?: IsoTime
}

/** GET /api/bootstrap：除数据快照以外，页面要的全部数据 */
export interface Bootstrap {
  now: IsoTime
  today: DayKey
  version: Version
  paths: DataPaths
  works: Work[]
  ideas: Idea[]
  accounts: Account[]
  /** 每个账号最近一次拉数据的结果（没拉过的账号没有） */
  pulls: PullRecord[]
  notes: WeeklyNote[]
  schedules: BootstrapScheduleView[]
}
