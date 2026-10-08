"use client"

import { Copy, NotebookText, Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/base/empty-state"
import { IconButton } from "@/components/base/icon-button"
import { Markdown } from "@/components/base/markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { profilePath } from "@/data/accounts"
import { copyText } from "@/lib/platform"
import { useAccounts, useProfile } from "@/state/accounts"

/**
 * D2 账号档案：一份随便写的 Markdown。定位、写给谁、文风、禁用词、对标、目标、调整记录……想写什么写什么；
 * agent 写稿前整份读（作品详情的「复制给 AI」会带上它）。平时显示排好版的文字，点「编辑」改原文。
 */
export function AccountProfile({ accountId }: { accountId: string }) {
  const profile = useProfile(accountId)
  const saveProfile = useAccounts((state) => state.saveProfile)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  const startEdit = () => {
    setDraft(profile)
    setEditing(true)
  }

  const save = () => {
    saveProfile(accountId, draft)
    setEditing(false)
    toast.success("档案已保存")
  }

  const copy = async () => {
    if (await copyText(profile)) toast.success("已复制")
    else toast("浏览器不让写剪贴板，请手动选中复制")
  }

  return (
    <section
      id="profile"
      aria-labelledby="profile-title"
      data-profile-block
      className="overflow-hidden rounded-lg border border-line bg-card shadow-sm"
    >
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <NotebookText className="size-4 shrink-0 text-fg-2" aria-hidden />
        <h2 id="profile-title" className="shrink-0 text-sm font-medium">
          档案
        </h2>
        <span className="hidden min-w-0 truncate font-mono text-xs text-fg-2 sm:inline" title={profilePath(accountId)}>
          {profilePath(accountId)}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button size="sm" onClick={save} data-profile-save>
                保存
              </Button>
            </>
          ) : (
            <>
              <IconButton label="复制档案" onClick={() => void copy()}>
                <Copy />
              </IconButton>
              <Button size="sm" variant="outline" onClick={startEdit} data-profile-edit>
                <Pencil />
                编辑
              </Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="p-3">
          <Textarea
            id="profile-input"
            aria-label="档案原文"
            data-profile-input
            autoFocus
            rows={20}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // ⌘ / Ctrl + 回车保存；输入法选词时的回车不算
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                event.preventDefault()
                save()
              }
            }}
            className="min-h-[360px] font-mono text-xs leading-relaxed"
          />
        </div>
      ) : profile.trim() ? (
        <Markdown source={profile} className="px-4 py-3" data-profile />
      ) : (
        <EmptyState
          icon={NotebookText}
          title="还没写"
          action={
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil />
              写档案
            </Button>
          }
        />
      )}
    </section>
  )
}

export default AccountProfile
