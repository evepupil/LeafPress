import type { WorkDetail } from "@leafpress/core"

import { API_BASE } from "@/state/api"
import { pickPublishPage } from "./work-sheet-publish-page"

/** 发布稿文件的接口地址：编号和文件名都要编码（文件名是中文） */
export function publishPageUrl(id: string, file: string): string {
  return `${API_BASE}/api/works/${encodeURIComponent(id)}/files/${encodeURIComponent(file)}`
}

/** 等你处理面板用的发布稿地址；没有任务详情或详情里没有发布稿时返回 undefined */
export function publishPageUrlOf(id: string, detail?: WorkDetail): string | undefined {
  const file = pickPublishPage(detail?.files ?? [])
  return file ? publishPageUrl(id, file) : undefined
}
