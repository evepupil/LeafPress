"use client"

import { cn } from "cn"
import { useRef } from "react"
import { toast } from "sonner"

import { ColorDot, PlatformMark } from "@/components/base/marks"
import { PLATFORMS, columnOf } from "@/data/accounts"
import type { Account, Work } from "@/data/types"
import { copyText } from "@/lib/platform"

/** 账号选项的内容：平台标识 + 名字 + 「· 平台名」。三个号都叫一叶之桐，靠平台名区分 */
export function AccountOptionContent({ account }: { account: Account }) {
  return (
    <>
      <PlatformMark platform={account.platform} size={14} />
      <span className="truncate">{account.name}</span> <span className="shrink-0 text-fg-2">· {PLATFORMS[account.platform].name}</span>
    </>
  )
}

/** 栏目色点 + 栏目名；作品的栏目挂在主账号下 */
export function ColumnLabel({ work, className }: { work: Pick<Work, "accountId" | "columnId">; className?: string }) {
  const column = columnOf(work.accountId, work.columnId)
  if (!column) return null
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <ColorDot color={column.color} />
      <span className="truncate">{column.name}</span>
    </span>
  )
}

/** 复制成功才提示；浏览器不给剪贴板权限时不打扰 */
export function copyWithToast(text: string): void {
  copyText(text).then((ok) => {
    if (ok) toast.success("已复制")
  })
}

/**
 * 抽屉和弹窗关掉后，把键盘焦点还给打开它的那个按钮。
 * 浮层组件只会把焦点还给它自带的触发器，这里的浮层是靠状态打开的、没有触发器，焦点会掉到页面顶上。
 * 打开前调 `remember()`，把 `restore` 交给浮层的「关闭后自动聚焦」。
 */
export function useReturnFocus() {
  const target = useRef<HTMLElement | null>(null)
  return {
    remember() {
      target.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    },
    restore(event: Event) {
      event.preventDefault()
      target.current?.focus()
    },
  }
}
