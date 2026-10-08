"use client"

import { useRef, useState, type DragEvent } from "react"

/**
 * 看板拖动卡片（浏览器自带的拖放）。作品看板和灵感看板共用：
 * - 卡片 draggable，onDragStart 里调 startCardDrag(event, 类型, 编号)，卡片外层元素带 data-drag-id={编号}
 * - 列的外层展开 useBoardDrop 返回的 dropProps；松手时按鼠标高度算出落在哪张卡前面（beforeId，为空表示最后）
 * - 拖动途中 beforeId 也会实时给出，列里在那张卡前面画一条插入线（DropLine）
 * 手机上浏览器不支持拖放，卡片菜单里另给「挪到…」。
 */

export const WORK_DRAG = "application/x-leafpress-work"
export const IDEA_DRAG = "application/x-leafpress-idea"

/** 正在拖的卡片编号。拖动途中浏览器不让读拖动的数据，只能自己记一份 */
let dragging: string | null = null

export function startCardDrag(event: DragEvent, type: string, id: string) {
  dragging = id
  event.dataTransfer.setData(type, id)
  event.dataTransfer.setData("text/plain", id)
  event.dataTransfer.effectAllowed = "move"
}

export function endCardDrag() {
  dragging = null
}

function accepts(event: DragEvent, type: string) {
  return event.dataTransfer.types.includes(type)
}

/** 鼠标在哪张卡的上半截之上，就落在那张卡前面；都不是就放最后。跳过正在拖的那张 */
function beforeIdAt(container: HTMLElement, clientY: number): string | null {
  const cards = container.querySelectorAll<HTMLElement>("[data-drag-id]")
  for (const card of cards) {
    const id = card.dataset.dragId
    if (!id || id === dragging) continue
    const rect = card.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return id
  }
  return null
}

export function useBoardDrop(type: string, onDrop: (id: string, beforeId: string | null) => void) {
  const [over, setOver] = useState(false)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const depth = useRef(0)

  const reset = () => {
    depth.current = 0
    setOver(false)
    setBeforeId(null)
  }

  return {
    over,
    /** 插入线画在哪张卡前面；over 为 false 时没有意义 */
    beforeId,
    dropProps: {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event, type)) return
        depth.current += 1
        setOver(true)
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event, type)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        const next = beforeIdAt(event.currentTarget, event.clientY)
        if (next !== beforeId) setBeforeId(next)
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event, type)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) reset()
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!accepts(event, type)) return
        event.preventDefault()
        const id = event.dataTransfer.getData(type)
        const before = beforeIdAt(event.currentTarget, event.clientY)
        reset()
        endCardDrag()
        if (id) onDrop(id, before === id ? null : before)
      },
    },
  }
}

/** 插入线：拖动时画在落点那张卡前面 */
export function DropLine() {
  return <div aria-hidden className="mx-1 h-0.5 shrink-0 rounded-full bg-ink/50" />
}
