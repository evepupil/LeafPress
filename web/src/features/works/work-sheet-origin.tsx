"use client"

import { type Idea, type PlatformId, type Work, type WorkSource } from "@leafpress/core"
import { cn } from "cn"
import { Copy, Lightbulb } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { IconButton } from "@/components/base/icon-button"
import { PlatformMark } from "@/components/base/marks"
import { useAccounts, useIdeas, useWorks } from "@/state/data"
import { focusRing } from "@/lib/styles"
import { copyWithToast } from "./work-sheet-actions"
import { FieldRow, VALUE_CELL } from "./work-sheet-parts"

const LINK_CELL = cn(VALUE_CELL, "w-full text-left transition-colors duration-(--dur-fast) hover:bg-hover", focusRing)

function SourceValue({
  source,
  sourceWork,
  idea,
  platform,
}: {
  source: WorkSource
  sourceWork: Work | undefined
  idea: Idea | undefined
  platform?: PlatformId
}) {
  const router = useRouter()
  switch (source.kind) {
    case "idea":
      return idea ? (
        <Link href={`/ideas/?open=${encodeURIComponent(idea.id)}`} title={idea.text} className={LINK_CELL}>
          <Lightbulb className="size-3.5 shrink-0 text-fg-3" aria-hidden />
          <span className="truncate">{idea.text}</span>
        </Link>
      ) : (
        <div className={VALUE_CELL}>
          <span className="truncate text-fg-2">来自一条已删除的灵感</span>
        </div>
      )
    case "work":
      return sourceWork ? (
        <button
          type="button"
          data-source-work={sourceWork.id}
          title={sourceWork.title}
          onClick={() => router.replace(`/?open=${encodeURIComponent(sourceWork.id)}`, { scroll: false })}
          className={LINK_CELL}
        >
          {platform && <PlatformMark platform={platform} size={16} />}
          <span className="truncate">{sourceWork.title}</span>
        </button>
      ) : (
        <div className={VALUE_CELL}>
          <span className="truncate text-fg-2">来自一个已删除的作品</span>
        </div>
      )
    case "import":
      return (
        <div className={VALUE_CELL}>
          <span className="truncate">从博客仓库导入</span>
        </div>
      )
    case "none":
      return (
        <div className={VALUE_CELL}>
          <span className="truncate">直接新建</span>
        </div>
      )
  }
}

export function WorkSheetOrigin({ work }: { work: Work }) {
  const source = work.source
  const works = useWorks()
  const ideas = useIdeas()
  const accounts = useAccounts()
  const sourceWork = source.kind === "work" ? works.find((item) => item.id === source.workId) : undefined
  const idea = source.kind === "idea" ? ideas.find((item) => item.id === source.ideaId) : undefined
  const platform = sourceWork ? accounts.find((item) => item.id === sourceWork.accountId)?.platform : undefined
  const path = work.localPath ?? sourceWork?.localPath
  return (
    <>
      <FieldRow label="来源">
        <SourceValue source={source} sourceWork={sourceWork} idea={idea} platform={platform} />
      </FieldRow>
      {path && (
        <FieldRow label="原稿">
          <div className={VALUE_CELL}>
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
              {path}
            </span>
            <IconButton size="icon-xs" label="复制路径" onClick={() => void copyWithToast(path, "已复制")}>
              <Copy />
            </IconButton>
          </div>
        </FieldRow>
      )}
    </>
  )
}
