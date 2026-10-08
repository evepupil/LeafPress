import { IDEA_SOURCE_LABEL } from "@/data/labels"
import type { Idea, Work } from "@/data/types"
import type { IdeaPatch } from "@/state/ideas"

/** 灵感卡片和抽屉用到的几个纯函数 */

/** 转出去的作品里还存在的（作品被删了就跳过） */
export function worksOf(idea: Idea, worksById: ReadonlyMap<string, Work>): Work[] {
  return idea.workIds.flatMap((id) => {
    const work = worksById.get(id)
    return work ? [work] : []
  })
}

/** 来源补充。已经以来源名开头的（例如来源「CloudMind」、补充「CloudMind · 9 月记忆」）去掉重复的来源名，免得连着读两遍 */
export function sourceDetailOf(idea: Pick<Idea, "source" | "sourceDetail">): string | undefined {
  const detail = idea.sourceDetail?.trim()
  if (!detail) return undefined
  const label = IDEA_SOURCE_LABEL[idea.source]
  if (!detail.startsWith(label)) return detail
  const rest = detail.slice(label.length)
  // 来源名后面必须是分隔符或结尾，「收藏夹里的文章」不能被当成「收藏」+「夹里的文章」
  if (rest !== "" && !/^[\s·]/.test(rest)) return detail
  return rest.replace(/^[\s·]+/, "") || undefined
}

/**
 * 抽屉里草稿相对已保存内容的改动。
 * 一句话清空了不算改动（还原）；多余的首尾空格去掉；没有改动返回空。
 */
export function draftPatch(saved: Idea, text: string, detail: string): IdeaPatch | null {
  const patch: IdeaPatch = {}
  const nextText = text.trim()
  const nextDetail = detail.trim()
  if (nextText && nextText !== saved.text) patch.text = nextText
  if (nextDetail !== saved.detail) patch.detail = nextDetail
  return Object.keys(patch).length > 0 ? patch : null
}
