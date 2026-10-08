"use client"

import { Keyboard, SquarePen } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useSyncExternalStore, type ReactNode } from "react"

import { IconButton } from "@/components/base/icon-button"
import { PlatformMark } from "@/components/base/marks"
import { StatusIcon } from "@/components/base/status-icon"
import { DropdownMenuItem, DropdownMenuShortcut } from "@/components/ui/dropdown-menu"
import { ACCOUNTS } from "@/data/accounts"
import { WORKS } from "@/data/works"
import { formatCount } from "@/lib/format"
import { summaryOf } from "@/lib/metrics"
import { useIdeas } from "@/state/ideas"
import { useUi } from "@/state/ui"
import { BrandMenu } from "./brand-menu"
import { PAGES, VIEWS, VIEW_COUNTS, resolveNav, viewHref, type PageKey, type ViewKey } from "./nav"
import { NavRow, SectionTitle } from "./sidebar-parts"

/** 账号行：数字是粉丝数。三个号都叫一叶之桐，靠平台标识区分 */
const ACCOUNT_ROWS = ACCOUNTS.map((account) => ({
  account,
  href: `/accounts/${account.id}/`,
  followers: formatCount(summaryOf(account.id).followers),
}))

const VIEW_ICON: Record<ViewKey, ReactNode> = {
  waiting: <StatusIcon glyph="half" tone="progress" />,
  pending: <StatusIcon glyph="dot" tone="progress" />,
  issues: <StatusIcon glyph="alert" tone="risk" />,
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange)
  window.addEventListener("popstate", onChange)
  return () => {
    window.removeEventListener("hashchange", onChange)
    window.removeEventListener("popstate", onChange)
  }
}

/**
 * 地址栏里的锚点（#sources）。usePathname 和 useSearchParams 读不到它，
 * 而「数据异常」和「数据」是同一个页面，只能靠锚点分开。
 * 站内跳转用的是 pushState，不会触发 hashchange；每次渲染都换一个新的读取函数，
 * 让 React 在提交后重新读一遍，地址栏更新得比渲染晚的那一帧也能补上。
 */
function useLocationHash(): string {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  )
}

/** 工作台侧栏：页面、各个账号、常用视图；只有当前入口有整行浅灰 */
export function WorkbenchSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const hash = useLocationHash()
  const inboxCount = useIdeas((state) => state.ideas.filter((idea) => idea.status === "inbox").length)
  const setCaptureOpen = useUi((state) => state.setCaptureOpen)
  const setShortcutsOpen = useUi((state) => state.setShortcutsOpen)

  const active = resolveNav(pathname, params, hash)
  // 页面行旁边的数字：作品总数、灵感收件箱里还没处理的条数（清空后不显示）
  const pageCounts: Partial<Record<PageKey, number>> = { works: WORKS.length, ideas: inboxCount > 0 ? inboxCount : undefined }

  // 手机上侧栏在抽屉里：先收起抽屉，再打开弹窗
  const openCapture = () => {
    onNavigate?.()
    setCaptureOpen(true)
  }
  const openShortcuts = () => {
    onNavigate?.()
    setShortcutsOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-2">
        <BrandMenu>
          <DropdownMenuItem onSelect={openCapture}>
            <SquarePen />
            记灵感
            <DropdownMenuShortcut>N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openShortcuts}>
            <Keyboard />
            快捷键
            <DropdownMenuShortcut>?</DropdownMenuShortcut>
          </DropdownMenuItem>
        </BrandMenu>
        <IconButton label="记灵感" shortcut="N" className="ml-auto" onClick={openCapture}>
          <SquarePen />
        </IconButton>
      </div>

      <nav aria-label="主导航" className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
          {PAGES.map((page) => (
            <NavRow
              key={page.key}
              href={page.path}
              icon={<page.icon className="size-4" />}
              label={page.label}
              count={pageCounts[page.key]}
              active={active?.kind === "page" && active.key === page.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <SectionTitle>账号</SectionTitle>
        <div className="flex flex-col gap-px">
          {ACCOUNT_ROWS.map(({ account, href, followers }) => (
            <NavRow
              key={account.id}
              href={href}
              icon={<PlatformMark platform={account.platform} size={16} />}
              label={account.name}
              count={followers}
              active={active?.kind === "account" && active.id === account.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <SectionTitle>视图</SectionTitle>
        <div className="flex flex-col gap-px">
          {VIEWS.map((view) => (
            <NavRow
              key={view.key}
              href={viewHref(view)}
              icon={VIEW_ICON[view.key]}
              label={view.label}
              count={VIEW_COUNTS[view.key]}
              active={active?.kind === "view" && active.key === view.key}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </div>
  )
}
