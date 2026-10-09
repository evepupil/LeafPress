import type { DayKey, IsoTime } from "./common.ts"
import type { WorkTotals } from "./work.ts"

/** 记录库里账号一天的原始数（拉数据时写）。reads、interactions 只有平台直接给了账号层面的数时才有，否则由作品的数加起来 */
export interface AccountDayRecord {
  accountId: string
  day: DayKey
  followers: number | null
  reads: number | null
  interactions: number | null
}

/** 记录库里作品一天结束时的累计数（拉数据时写） */
export interface WorkSnapshotRecord {
  workId: string
  day: DayKey
  totals: WorkTotals
}

/** 一个账号一天的数据 */
export interface DailyPoint {
  day: DayKey
  /** 当天结束时的粉丝数；那天没拉到为 null */
  followers: number | null
  /** 当天新增的主数据（浏览 / 访问 / 播放） */
  reads: number
  /** 当天新增的互动（平台标了互动的数据项加起来） */
  interactions: number
  /** 当天发布的作品数 */
  posts: number
}

/** 一个已发作品一天新增的数据 */
export interface WorkDay {
  day: DayKey
  reads: number
  interactions: number
}

/**
 * 数据页、账号页、周报要的全部快照数据（本机服务从记录库算出来给网页）。
 * 只含最近 DATASET_DAYS 天；同样的输入，统计函数每次结果相同。
 */
export interface MetricsDataset {
  /** 今天（本地） */
  today: DayKey
  /** 数据到哪天：昨天 */
  latestDay: DayKey
  /**
   * 每个拉到过数据的账号每天的数（键是账号编号）。从这个号在窗口里第一次有数据那天到 latestDay，一天一条、不缺天；
   * 没拉到的那天 followers 为 null、其余为 0。从没拉到过数据的账号没有这个键
   */
  daily: Record<string, DailyPoint[]>
  /**
   * 每个账号在记录库里真正有数的最后一天（键是账号编号）：窗口里这个号的账号每天记录里最大的日期，不超过 latestDay。
   * daily 会把最后一次拉取之后的天补成 0，补出来的天看不出是拉到了还是没拉；这里只看真实的记录行，
   * 所以博客某天拉到了、可访问是 0，也算数据到这天。窗口里没有记录的账号没有这个键
   */
  lastDays: Record<string, DayKey>
  /** 每个已发作品每天新增的数（键是作品编号），按日期升序，只含有新增的天 */
  workDays: Record<string, WorkDay[]>
}

/** 每周复盘笔记 */
export interface WeeklyNote {
  /** 那周的周一 */
  week: DayKey
  wins: string
  improve: string
  next: string
  updatedAt: IsoTime
}
