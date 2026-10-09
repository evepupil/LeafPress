import { toast } from "sonner"

import { ApiError } from "@/state/api"

export type NoticeTone = "success" | "info" | "warning" | "error"

/** 一条提示条：标题是主要的一句，detail 是补充的一行小字（比如怎么修） */
export interface ToastNotice {
  tone: NoticeTone
  title: string
  detail?: string
}

/** 按语气选提示条的样式（图标由 Toaster 统一配好）；detail 放在标题下面 */
export function notify({ tone, title, detail }: ToastNotice): void {
  const options = detail ? { description: detail } : undefined
  if (tone === "success") toast.success(title, options)
  else if (tone === "warning") toast.warning(title, options)
  else if (tone === "error") toast.error(title, options)
  else toast(title, options)
}

/**
 * 请求失败的提示：服务端给的原因当标题，怎么修（hint）放在下面一行。
 * 不是服务端回的错误（比如断网时 fetch 抛出的英文错误）只说是什么操作失败了，连不上的提示由外壳顶部的连接条负责。
 */
export function toastFailure(error: unknown, fallback: string): void {
  if (error instanceof ApiError) notify({ tone: "error", title: error.message, ...(error.hint ? { detail: error.hint } : {}) })
  else notify({ tone: "error", title: fallback })
}
