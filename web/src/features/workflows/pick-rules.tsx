import { cn } from "cn"
import { Workflow } from "lucide-react"
import Link from "next/link"

import { PlatformMark } from "@/components/base/marks"
import { PLATFORMS } from "@/data/accounts"
import type { PlatformId } from "@/data/types"
import { workflowById } from "@/data/workflows"
import { focusRing } from "@/lib/styles"

interface PickRule {
  platform: PlatformId
  /** 作品从哪来，给人看的说法 */
  source: string
  workflowId: string
}

/** 创建作品时按「平台 + 来源」挑工作流，和 pickWorkflow 的规则一一对应 */
const RULES: PickRule[] = [
  { platform: "blog", source: "都行", workflowId: "blog-write" },
  { platform: "zhihu", source: "博客作品", workflowId: "blog-to-zhihu" },
  { platform: "zhihu", source: "灵感、直接新建", workflowId: "zhihu-write" },
  { platform: "xiaohongshu", source: "都行", workflowId: "to-xhs-cards" },
  { platform: "bilibili", source: "都行", workflowId: "video-pipeline" },
]

/** 自动配规则：创建作品时怎么挑工作流。工作流一列是锚点链接，点了跳到上面对应的那张卡 */
export function PickRules() {
  return (
    <section id="rules" aria-labelledby="rules-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Workflow className="size-4 text-fg-2" aria-hidden />
        <h2 id="rules-title" className="text-sm font-medium">
          自动配规则
        </h2>
        <span className="text-sm text-fg-2 tabular">{RULES.length}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="h-8 bg-raised text-xs text-fg-2">
            <th scope="col" className="px-3 text-left font-normal">
              平台
            </th>
            <th scope="col" className="px-3 text-left font-normal">
              来源
            </th>
            <th scope="col" className="px-3 text-left font-normal">
              工作流
            </th>
          </tr>
        </thead>
        <tbody>
          {RULES.map((rule) => (
            <tr key={rule.workflowId} className="h-9 border-t border-line">
              <td className="px-3">
                <span className="inline-flex items-center gap-1.5">
                  <PlatformMark platform={rule.platform} />
                  {PLATFORMS[rule.platform].name}
                </span>
              </td>
              <td className="px-3">{rule.source}</td>
              <td className="px-3">
                <Link
                  href={`#${rule.workflowId}`}
                  data-rule-workflow={rule.workflowId}
                  className={cn("rounded-sm text-fg hover:underline", focusRing)}
                >
                  {workflowById(rule.workflowId).name}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-fg-2">作品里可以换成同平台的其他工作流，开始做之前都能换。</p>
    </section>
  )
}

export default PickRules
