"use client"

import { SquarePen } from "lucide-react"
import type { ReactNode } from "react"

import { LeafMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { useUi } from "@/state/ui"
import { CommandPalette } from "./command-palette"
import { PAGES } from "./nav"
import { Notifications } from "./notifications"
import { QuickCapture } from "./quick-capture"
import { ShellFrame } from "./shell-frame"
import type { ShortcutConfig } from "./shortcuts"
import { UserMenu } from "./user-menu"
import { WorkbenchSidebar } from "./workbench-sidebar"

/** 先按 G 再按页面键：页面键 → 页面地址 */
const GO_KEYS: ShortcutConfig["go"] = Object.fromEntries(PAGES.map((page) => [page.goKey, page.path]))

/** 快捷键弹窗里除了搜索、折叠侧栏、快捷键以外的几行 */
const HELP_ROWS: ShortcutConfig["help"] = [
  { label: "记灵感", keys: ["N"] },
  ...PAGES.map((page) => ({ label: `跳到${page.label}`, keys: ["G", page.goKey.toUpperCase()] })),
]

/** 工作台的外框：通用骨架 + 自己的侧栏、搜索、提醒、头像菜单和记灵感 */
export function WorkbenchShell({ children }: { children: ReactNode }) {
  const setCaptureOpen = useUi((state) => state.setCaptureOpen)

  return (
    <ShellFrame
      crumb={{ icon: <LeafMark size={16} />, label: "自媒体" }}
      sidebar={(onNavigate) => <WorkbenchSidebar onNavigate={onNavigate} />}
      windowBar={{
        searchLabel: "搜索作品、账号、工具",
        notifications: <Notifications />,
        userMenu: <UserMenu />,
      }}
      overlays={
        <>
          <CommandPalette />
          <QuickCapture />
          {/* 手机上侧栏收进了抽屉，右下角留一个随时能记灵感的圆钮；桌面有侧栏按钮和 N 键 */}
          <Button
            size="icon-lg"
            aria-label="记灵感"
            className="fixed right-4 bottom-4 z-40 rounded-full shadow-md lg:hidden"
            onClick={() => setCaptureOpen(true)}
          >
            <SquarePen />
          </Button>
        </>
      }
      shortcuts={{
        go: GO_KEYS,
        keys: { n: () => setCaptureOpen(true) },
        help: HELP_ROWS,
      }}
    >
      {children}
    </ShellFrame>
  )
}
