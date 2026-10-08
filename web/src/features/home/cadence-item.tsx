import { cn } from "cn"
import Link from "next/link"

import { PlatformMark } from "@/components/base/marks"
import { shortTitle, type CadenceItem } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"

/**
 * 三种状态靠样式区分：已发是白底，排期是虚线框，待回填是琥珀色字加小圆点。
 * 已发和待回填本来没有边框，这里留一圈透明边，让三种条目一样高。
 */
const ITEM_STYLE: Record<CadenceItem["kind"], string> = {
  published: "border border-transparent bg-card text-fg shadow-xs",
  planned: "border border-dashed border-line-3 bg-card text-fg-2",
  pending: "border border-transparent bg-card text-warn shadow-xs",
}

/**
 * 一天里的一个条目：点开就是这个作品的详情，完整标题放在 title 里。
 * 手机上标题单行截断；桌面七天并排，每天只有一百来像素宽，单行只能看到几个字，所以标题放宽到两行（md 起）。
 * 标题可能有两行，前面的小图标（平台标识、待回填的小圆点）要贴着第一行：md 起改成顶部对齐，
 * 再用上边距把它们垂直摆到第一行的正中（第一行高 16px，平台标识 12px → 2px，小圆点 6px → 5px）。
 */
export function CadenceEntry({ item }: { item: CadenceItem }) {
  return (
    <Link
      href={`/works/?open=${item.work.id}`}
      data-cadence-item={item.pub.id}
      data-kind={item.kind}
      title={item.work.title}
      className={cn("flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-0.5 text-xs md:items-start", ITEM_STYLE[item.kind], focusRing)}
    >
      {item.kind === "pending" && (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full md:mt-[5px]" style={{ background: "var(--label-amber)" }} />
      )}
      <PlatformMark platform={item.account.platform} size={12} className="md:mt-0.5" />
      <span className="truncate md:line-clamp-2 md:break-all md:whitespace-normal">{shortTitle(item.work.title)}</span>
    </Link>
  )
}
