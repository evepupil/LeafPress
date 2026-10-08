"use client"

import { type Work, type WorkDetail } from "@leafpress/core"
import { Copy, FileText, FolderOpen } from "lucide-react"
import { toast } from "sonner"

import { Spinner } from "@/components/base/state-icons"
import { IconButton } from "@/components/base/icon-button"
import { openFolder } from "@/state/actions/works"
import { copyWithToast } from "./work-sheet-actions"
import { SheetSection } from "./work-sheet-parts"

const FOR_YOU = new Set(["要你做的事.md", "你的反馈.md"])

export function WorkSheetFolder({ work, detail, loading, error }: { work: Work; detail?: WorkDetail; loading: boolean; error?: string }) {
  if (loading) {
    return (
      <SheetSection title="任务文件夹">
        <div aria-busy="true" data-task-files-loading className="flex items-center gap-2 text-xs text-fg-2">
          <Spinner />
          正在读取任务文件
        </div>
      </SheetSection>
    )
  }
  if (!detail && error) {
    return (
      <SheetSection title="任务文件夹">
        <p className="text-xs text-bad">任务文件暂不可用</p>
      </SheetSection>
    )
  }
  if (!detail) return null
  return (
    <SheetSection
      title="任务文件夹"
      aside={
        <div className="flex items-center gap-1">
          <IconButton size="icon-xs" label="复制路径" onClick={() => void copyWithToast(detail.folder, "已复制")}>
            <Copy />
          </IconButton>
          <IconButton
            size="icon-xs"
            label="打开任务文件夹"
            onClick={() =>
              void openFolder(work.id)
                .then(() => toast.success("已在资源管理器里打开"))
                .catch((error: unknown) => toast(error instanceof Error ? error.message : "打开文件夹失败"))
            }
          >
            <FolderOpen />
          </IconButton>
        </div>
      }
    >
      <p className="truncate font-mono text-xs text-fg-2" title={detail.folder}>
        {detail.folder}
      </p>
      <ul data-task-files className="mt-1.5 flex flex-col">
        {detail.files.length === 0 ? (
          <li data-task-files-empty className="py-1 text-xs text-fg-2">
            暂无任务文件
          </li>
        ) : (
          detail.files.map((name) => (
            <li key={name} className="flex h-7 items-center gap-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-fg-3" aria-hidden />
              <span className={`min-w-0 truncate font-mono ${FOR_YOU.has(name) ? "text-warn" : ""}`}>{name}</span>
            </li>
          ))
        )}
      </ul>
    </SheetSection>
  )
}
