"use client"

import { useIdeas } from "@/state/ideas"

/** 视图栏标题后面的灵感条数 */
export function IdeasMeta() {
  const count = useIdeas((state) => state.ideas.length)
  return <span className="tabular">{count}</span>
}

export default IdeasMeta
