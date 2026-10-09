import type { ImportSummary } from "@leafpress/core"

import type { ToastNotice } from "@/lib/notify"

/**
 * 导入完成后的提示。第一句说导入了几篇、几篇本来就有；
 * 有草稿或者读不了的文章时再补一句，只写有的那几样（读不了的有几篇由 issues 的个数决定）。
 * 有读不了的文章算部分成功，用警示语气。
 */
export function describeImport(summary: ImportSummary): ToastNotice {
  const unreadable = summary.issues.length
  const skipped = [...(summary.drafts > 0 ? [`跳过 ${summary.drafts} 篇草稿`] : []), ...(unreadable > 0 ? [`${unreadable} 篇读不了`] : [])]
  return {
    tone: unreadable > 0 ? "warning" : "success",
    title: `导入 ${summary.added} 篇，${summary.skipped} 篇已经有了`,
    ...(skipped.length > 0 ? { detail: skipped.join("，") } : {}),
  }
}
