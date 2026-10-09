import type { WorkDetail } from "@leafpress/core"

import { API_BASE } from "@/state/api"

export const COPY_PAGE_FILE = "知乎发布稿.html"

/** 作品的文件里有知乎发布稿时才有复制页可打开 */
export function copyPageUrl(id: string, files: readonly string[]): string | undefined {
  if (!files.includes(COPY_PAGE_FILE)) return undefined
  return `${API_BASE}/api/works/${encodeURIComponent(id)}/files/${encodeURIComponent(COPY_PAGE_FILE)}`
}

/** 等你处理面板用的复制页地址；没有任务详情或详情里没有发布稿时返回 undefined */
export function copyPageUrlOf(id: string, detail?: WorkDetail): string | undefined {
  return copyPageUrl(id, detail?.files ?? [])
}
