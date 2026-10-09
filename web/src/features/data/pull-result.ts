import type { PullResult } from "@leafpress/core"

import type { ToastNotice } from "@/lib/notify"

/**
 * 拉数据完成后的提示：文字一律用服务端给的 note（「入库 40 篇文章，补了 190 天历史」「博客：统计接口返回 401，其余已入库」），
 * 网页只决定语气——都入库了是成功，有账号没拉成是警示，没有能拉的账号只是告知。
 */
export function describePull(result: PullResult): ToastNotice {
  if (result.outcomes.length === 0) return { tone: "info", title: result.note }
  const failed = result.outcomes.some((outcome) => outcome.status === "failed")
  return { tone: failed ? "warning" : "success", title: result.note }
}
