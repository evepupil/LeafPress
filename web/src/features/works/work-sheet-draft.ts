"use client"

import { useState } from "react"

/**
 * 输入框的本地草稿：打字只改草稿，失焦才写进 store。
 * saved 是 store 里现在的值；它变了（比如 AI 把链接填好了、保存时去掉了首尾空格），草稿就跟着换成新值。
 * 换了一个作品时由外层用 key={work.id} 整体重置。
 */
export function useDraft(saved: string): [string, (value: string) => void] {
  const [draft, setDraft] = useState(saved)
  const [seen, setSeen] = useState(saved)
  if (saved !== seen) {
    setSeen(saved)
    setDraft(saved)
  }
  return [draft, setDraft]
}
