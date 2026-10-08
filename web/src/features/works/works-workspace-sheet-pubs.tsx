"use client"

import { Copy, ExternalLink } from "lucide-react"
import { useState } from "react"

import { LabelChip } from "@/components/base/label-chip"
import { IconButton } from "@/components/base/icon-button"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PLATFORMS, accountById } from "@/data/accounts"
import { PUB_FORMAT_LABEL, PUB_STATE_LABEL } from "@/data/labels"
import type { Publication } from "@/data/types"
import { formatDay } from "@/lib/format"
import { metricText } from "@/lib/metrics"
import { copyWithToast } from "./works-workspace-parts"

/** 已发版本的四项数据；`key` 同时是 `metricText` 的取数项 */
const METRICS = [
  { key: "reads", label: "阅读" },
  { key: "likes", label: "赞同" },
  { key: "collects", label: "收藏" },
  { key: "comments", label: "评论" },
] as const

/**
 * 抽屉里一个平台版本：平台和账号、当前状态（已发的给链接按钮，等回填的给回填入口）、
 * 回答挂的问题、已发版本的数据。「回填链接」展开一行输入，登记后这个版本按已发显示。
 */
export function PubBlock({ pub, onBackfill }: { pub: Publication; onBackfill(pub: Publication, url: string): void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [url, setUrl] = useState("")
  const account = accountById(pub.accountId)
  const platform = PLATFORMS[account.platform]
  const link = pub.url

  return (
    <div data-pub-row={pub.id} className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <PlatformMark platform={platform.id} size={16} />
        <span className="shrink-0 text-sm">
          {platform.name}
          {pub.format !== "article" && PUB_FORMAT_LABEL[pub.format]}
        </span>
        <span className="min-w-0 truncate text-xs text-fg-2">{account.name}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {pub.state === "published" && (
            <>
              {pub.publishedAt && <span className="text-xs text-fg-2 tabular">{formatDay(pub.publishedAt)}</span>}
              {link && (
                <>
                  <IconButton label="打开链接" onClick={() => window.open(link, "_blank", "noreferrer")}>
                    <ExternalLink />
                  </IconButton>
                  <IconButton label="复制链接" onClick={() => copyWithToast(link)}>
                    <Copy />
                  </IconButton>
                </>
              )}
            </>
          )}
          {pub.state === "pending-link" && (
            <Button size="sm" variant="outline" data-backfill-open aria-expanded={formOpen} onClick={() => setFormOpen((open) => !open)}>
              回填链接
            </Button>
          )}
          {pub.state === "scheduled" && (
            <span className="text-xs text-fg-2 tabular">
              {pub.plannedFor ? `计划 ${formatDay(pub.plannedFor)}` : PUB_STATE_LABEL.scheduled}
            </span>
          )}
          {pub.state === "draft" && <LabelChip>草稿</LabelChip>}
        </div>
      </div>
      {pub.state === "pending-link" && formOpen && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            const value = url.trim()
            if (!value) return
            onBackfill(pub, value)
          }}
        >
          <Input
            data-backfill-input
            autoFocus
            aria-label="粘贴链接"
            placeholder="粘贴发布后的链接"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-7"
          />
          <Button type="submit" size="sm" data-backfill-submit disabled={url.trim() === ""}>
            登记
          </Button>
        </form>
      )}
      {pub.question && <p className="text-xs break-words text-fg-2">回答：{pub.question}</p>}
      {pub.state === "published" && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          {METRICS.map(({ key, label }) => (
            <div key={key} data-pub-metric={key} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-fg-2">{label}</span>
              <span className="text-sm tabular">{metricText(pub, key)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
