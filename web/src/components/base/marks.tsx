import { cn } from "cn"
import { Leaf } from "lucide-react"

import { PLATFORMS } from "@/data/accounts"
import type { LabelColor, PlatformId } from "@/data/types"

/** 产品标识：深色方块里一片叶子 */
export function LeafMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] bg-fg", className)}
      style={{ width: size, height: size }}
    >
      <Leaf className="text-white" size={Math.round(size * 0.62)} strokeWidth={2} />
    </span>
  )
}

/** 平台标识：平台色小方块 + 一个字（知、博、公、B、红） */
export function PlatformMark({ platform, size = 16, className }: { platform: PlatformId; size?: number; className?: string }) {
  const item = PLATFORMS[platform]
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[4px] font-medium text-white", className)}
      style={{
        width: size,
        height: size,
        background: `var(--label-${item.color})`,
        fontSize: Math.max(9, Math.round(size * 0.6)),
        lineHeight: 1,
      }}
    >
      {item.glyph}
    </span>
  )
}

/** 标签色点 */
export function ColorDot({ color, className }: { color: LabelColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: `var(--label-${color})` }}
    />
  )
}
