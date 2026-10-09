import type { LabelColor } from "./common.ts"

export type PlatformId = "blog" | "zhihu" | "bilibili" | "xiaohongshu"

/** 平台上一个作品的一项数据，例如知乎的「浏览」「点赞」、B站的「投币」「弹幕」 */
export interface MetricDef {
  /** 平台内唯一，存进记录库：views、likes…… */
  key: string
  label: string
  /** 算不算互动：合计「互动」时把这些加起来 */
  interaction: boolean
}

/** 配置项用在哪：拉数据、发布、写稿。拉数据要的都配好了，「现在拉一次」才拉得到 */
export type SetupUse = "data" | "publish" | "write"

/** 接这个平台的账号要配的一样东西（定义）。值：普通的存记录库，密钥存凭证文件 */
export interface SetupItemDef {
  /** 平台内唯一，`^[a-z][a-z0-9-]*$` */
  key: string
  label: string
  /** 密钥：只存凭证文件，任何接口和输出都只说「已配置 / 未配置」 */
  secret: boolean
  usedFor: SetupUse
  /** 输入框里的示例 */
  placeholder?: string
  /** 一句话：去哪拿、填什么 */
  hint?: string
}

/** 数据怎么拿：平台接口、网站统计、登录后抓创作中心页面。没有手填 */
export type DataMode = "api" | "analytics" | "crawler"

/** 拿数据的工具（说明）。实现在 src/platforms/<平台>/，由平台适配登记 */
export interface DataToolInfo {
  mode: DataMode
  /** 给人看的来源名，例如「Umami 统计」 */
  provider: string
}

export interface PlatformInfo {
  id: PlatformId
  name: string
  /** 平台标识方块里的一个字 */
  glyph: string
  color: LabelColor
  /** 新作品编号的前缀字母：b-101、z-102 */
  idPrefix: string
  /** 「粉丝」在这个平台叫什么：关注者、订阅、粉丝 */
  audienceLabel: string
  /** 作品数据项，各平台不一样；第一项是主数据（浏览、访问、播放） */
  metrics: MetricDef[]
  /** 这个平台的账号要配的东西。接这个平台时补齐；还没接的平台是空数组 */
  setupItems: SetupItemDef[]
  /** 拿数据的工具；还没做时没有这个字段 */
  dataTool?: DataToolInfo
  /** 能把平台上已有的作品导入成已完成作品（博客：从仓库导入文章）；不能时没有这个字段 */
  importable?: boolean
}
