import { Archive, Bookmark, CalendarDays, CheckCheck, FolderGit2, Inbox, PenLine, Sparkles, Star, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { IdeaSource, IdeaStatus } from "@/data/types"

/** 灵感来源和灵感状态各配一枚图标：速记框的来源计数、看板的列标题、卡片的来源标签、卡片菜单共用这一份 */

const SOURCE_ICON: Record<IdeaSource, LucideIcon> = {
  quick: PenLine,
  devlog: FolderGit2,
  cloudmind: Sparkles,
  bookmark: Bookmark,
  trend: TrendingUp,
}

const STATUS_ICON: Record<IdeaStatus, LucideIcon> = {
  inbox: Inbox,
  promising: Star,
  scheduled: CalendarDays,
  converted: CheckCheck,
  shelved: Archive,
}

export function IdeaSourceIcon({ source, className }: { source: IdeaSource; className?: string }) {
  const Icon = SOURCE_ICON[source]
  return <Icon className={className} aria-hidden />
}

export function IdeaStatusIcon({ status, className }: { status: IdeaStatus; className?: string }) {
  const Icon = STATUS_ICON[status]
  return <Icon className={className} aria-hidden />
}
