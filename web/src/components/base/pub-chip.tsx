import { PLATFORMS, accountById } from "@/data/accounts"
import { PUB_FORMAT_LABEL, PUB_STATE_LABEL } from "@/data/labels"
import type { Publication } from "@/data/types"
import { formatDayShort } from "@/lib/format"
import { LabelChip } from "./label-chip"
import { PlatformMark } from "./marks"

/** 版本小标签：知乎、知乎回答、知乎·待回填、小红书卡片·10/10、B站视频·草稿 */
export function PubChip({ pub, className }: { pub: Publication; className?: string }) {
  const platform = PLATFORMS[accountById(pub.accountId).platform]
  const format = pub.format === "answer" || pub.format === "video" || pub.format === "cards" ? PUB_FORMAT_LABEL[pub.format] : ""
  const state =
    pub.state === "published"
      ? ""
      : pub.state === "pending-link"
        ? "·待回填"
        : pub.state === "scheduled"
          ? `·${pub.plannedFor ? formatDayShort(pub.plannedFor) : PUB_STATE_LABEL.scheduled}`
          : "·草稿"
  return (
    <LabelChip
      className={className}
      icon={<PlatformMark platform={platform.id} size={12} />}
      color={pub.state === "pending-link" ? "amber" : undefined}
      title={`${platform.name} · ${PUB_FORMAT_LABEL[pub.format]} · ${PUB_STATE_LABEL[pub.state]}`}
    >
      {`${platform.name}${format}${state}`}
    </LabelChip>
  )
}
