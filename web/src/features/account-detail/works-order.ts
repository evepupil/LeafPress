import type { PubState, Publication } from "@/data/types"
import { PUBLICATIONS, workById } from "@/data/works"

/** 离发出越近越靠前：等回填链接 → 已排期 → 草稿 → 已发 */
const STATE_ORDER: Record<PubState, number> = {
  "pending-link": 0,
  scheduled: 1,
  draft: 2,
  published: 3,
}

/**
 * 一个账号上的全部版本，账号页的作品列表按这个顺序排：
 * 没发出去的在前（同一类里，作品最近改过的在前），已发的在后（发布日新的在前）。
 * 日子相同时编号大的在前，结果每次都一样。
 */
export function orderAccountPubs(accountId: string): Publication[] {
  const mine = PUBLICATIONS.filter((pub) => pub.accountId === accountId)
  const unsent = mine
    .filter((pub) => pub.state !== "published")
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        workById(b.workId).updatedAt.localeCompare(workById(a.workId).updatedAt) ||
        b.id.localeCompare(a.id),
    )
  const published = mine
    .filter((pub) => pub.state === "published")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || b.id.localeCompare(a.id))
  return [...unsent, ...published]
}
