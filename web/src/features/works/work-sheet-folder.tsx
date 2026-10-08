"use client"

import { cn } from "cn"
import { Copy, FileText } from "lucide-react"

import { IconButton } from "@/components/base/icon-button"
import type { Work } from "@/data/types"
import { taskFolder } from "@/data/works"
import { taskFiles } from "@/lib/work-engine"
import { copyWithToast } from "./work-sheet-actions"
import { SheetSection } from "./work-sheet-parts"

/** 这两个文件是写给你的，用警示色标出来 */
const FOR_YOU = new Set(["要你做的事.md", "你的反馈.md"])

/** 任务文件夹：路径，和里面现在有哪些文件。任何 agent 读这个文件夹就能接着干 */
export function WorkSheetFolder({ work }: { work: Work }) {
  const folder = taskFolder(work.id)
  const files = taskFiles(work)

  return (
    <SheetSection
      title="任务文件夹"
      aside={
        <IconButton size="icon-xs" label="复制路径" onClick={() => void copyWithToast(folder, "已复制")}>
          <Copy />
        </IconButton>
      }
    >
      <p className="truncate font-mono text-xs text-fg-2" title={folder}>
        {folder}
      </p>
      <ul data-task-files className="mt-1.5 flex flex-col">
        {files.map((name) => (
          <li key={name} className="flex h-7 items-center gap-2 text-xs">
            <FileText className="size-3.5 shrink-0 text-fg-3" aria-hidden />
            <span className={cn("min-w-0 truncate font-mono", FOR_YOU.has(name) && "text-warn")}>{name}</span>
          </li>
        ))}
      </ul>
    </SheetSection>
  )
}
