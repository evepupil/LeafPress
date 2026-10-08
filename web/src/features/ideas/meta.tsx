"use client"

import { useIdeas } from "@/state/data"

/** 视图栏标题后面的灵感条数 */
export function IdeasMeta() {
  const count = useIdeas().length
  return <span className="tabular">{count}</span>
}

export default IdeasMeta
