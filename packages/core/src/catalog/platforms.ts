import type { MetricDef, PlatformId, PlatformInfo } from "../types/index.ts"

/**
 * 平台目录：每个平台的名字、标识、数据项、账号要配的东西、拿数据的工具。
 * 按平台一个一个接：接一个平台时在这里补上它的 setupItems 和 dataTool，实现放在 src/platforms/<平台>/。
 */

function metric(key: string, label: string, interaction = true): MetricDef {
  return { key, label, interaction }
}

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  blog: {
    id: "blog",
    name: "博客",
    glyph: "博",
    color: "green",
    idPrefix: "b",
    audienceLabel: "订阅",
    // 博客数据只走 Umami：访问、访客，都不算互动
    metrics: [metric("pageviews", "访问", false), metric("visitors", "访客", false)],
    setupItems: [],
  },
  zhihu: {
    id: "zhihu",
    name: "知乎",
    glyph: "知",
    color: "blue",
    idPrefix: "z",
    audienceLabel: "关注者",
    metrics: [
      metric("views", "浏览", false),
      metric("likes", "点赞"),
      metric("collects", "收藏"),
      metric("comments", "评论"),
      metric("shares", "分享"),
    ],
    setupItems: [],
  },
  bilibili: {
    id: "bilibili",
    name: "B站",
    glyph: "B",
    color: "pink",
    idPrefix: "v",
    audienceLabel: "粉丝",
    metrics: [
      metric("views", "播放", false),
      metric("likes", "点赞"),
      metric("coins", "投币"),
      metric("collects", "收藏"),
      metric("shares", "分享"),
      metric("danmaku", "弹幕"),
      metric("comments", "评论"),
    ],
    setupItems: [],
  },
  xiaohongshu: {
    id: "xiaohongshu",
    name: "小红书",
    glyph: "红",
    color: "red",
    idPrefix: "x",
    audienceLabel: "粉丝",
    metrics: [
      metric("views", "浏览", false),
      metric("likes", "点赞"),
      metric("collects", "收藏"),
      metric("comments", "评论"),
      metric("shares", "分享"),
    ],
    setupItems: [],
  },
}

/** 平台的固定顺序：页面上的筛选、加账号的选项都按这个排 */
export const PLATFORM_ORDER: PlatformId[] = ["zhihu", "blog", "bilibili", "xiaohongshu"]
