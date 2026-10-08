"use client"

import { cn } from "cn"
import { Copy, Lightbulb } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { IconButton } from "@/components/base/icon-button"
import { PlatformMark } from "@/components/base/marks"
import { accountById } from "@/data/accounts"
import type { Idea, Work, WorkSource } from "@/data/types"
import { focusRing } from "@/lib/styles"
import { useIdeas } from "@/state/ideas"
import { useWorks } from "@/state/works"
import { copyWithToast } from "./work-sheet-actions"
import { FieldRow, VALUE_CELL } from "./work-sheet-parts"

/** 可点的来源：整格悬停变浅灰，和旁边的下拉框一样大 */
const LINK_CELL = cn(VALUE_CELL, "w-full text-left transition-colors duration-(--dur-fast) hover:bg-hover", focusRing)

function SourceValue({ source, sourceWork, idea }: { source: WorkSource; sourceWork: Work | undefined; idea: Idea | undefined }) {
  const router = useRouter()

  switch (source.kind) {
    case "idea":
      return idea ? (
        <Link href={`/ideas/?open=${idea.id}`} title={idea.text} className={LINK_CELL}>
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
          onClick={() => router.replace(`/?open=${sourceWork.id}`, { scroll: false })}
          className={LINK_CELL}
        >
          <PlatformMark platform={accountById(sourceWork.accountId).platform} size={16} />
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

/** 属性里的「来源」和「原稿」两行：这个作品从哪来、原稿在本机哪个位置 */
export function WorkSheetOrigin({ work }: { work: Work }) {
  const source = work.source
  const sourceWork = useWorks((state) => (source.kind === "work" ? state.works.find((item) => item.id === source.workId) : undefined))
  const idea = useIdeas((state) => (source.kind === "idea" ? state.ideas.find((item) => item.id === source.ideaId) : undefined))
  const path = work.localPath ?? sourceWork?.localPath

  return (
    <>
      <FieldRow label="来源">
        <SourceValue source={source} sourceWork={sourceWork} idea={idea} />
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
