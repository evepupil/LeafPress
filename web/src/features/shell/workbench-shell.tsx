"use client"

import { SquarePen } from "lucide-react"
import type { ReactNode } from "react"

import { LeafMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { ConvertDialog } from "@/components/work/convert-dialog"
import { useUi } from "@/state/ui"
import { CommandPalette } from "./command-palette"
import { PAGES } from "./nav"
import { Notifications } from "./notifications"
import { QuickCapture } from "./quick-capture"
import { ShellFrame } from "./shell-frame"
import type { ShortcutConfig } from "./shortcuts"
import { StoreHydration } from "./store-hydration"
import { UserMenu } from "./user-menu"
import { WorkbenchSidebar } from "./workbench-sidebar"

/** 先按 G 再按页面键：页面键 → 页面地址 */
const GO_KEYS: ShortcutConfig["go"] = Object.fromEntries(PAGES.map((page) => [page.goKey, page.path]))

/** 快捷键弹窗里除了搜索、折叠侧栏、快捷键以外的几行 */
const HELP_ROWS: ShortcutConfig["help"] = [
  { label: "记灵感", keys: ["N"] },
  { label: "新建作品", keys: ["C"] },
  ...PAGES.map((page) => ({ label: `跳到${page.label}`, keys: ["G", page.goKey.toUpperCase()] })),
]

/** 新建作品弹窗：命令面板和 C 键打开，作品页的「新建作品」也用它 */
function NewWorkDialog() {
  const open = useUi((state) => state.newWorkOpen)
  const setOpen = useUi((state) => state.setNewWorkOpen)
  return <ConvertDialog source={open ? { kind: "new", title: "" } : null} onClose={() => setOpen(false)} />
}

/** 工作台的外框：通用骨架 + 自己的侧栏、搜索、提醒、头像菜单、记灵感和新建作品 */
export function WorkbenchShell({ children }: { children: ReactNode }) {
  const setCaptureOpen = useUi((state) => state.setCaptureOpen)
  const setNewWorkOpen = useUi((state) => state.setNewWorkOpen)

  return (
    <ShellFrame
      crumb={{ icon: <LeafMark size={16} />, label: "自媒体" }}
      sidebar={(onNavigate) => <WorkbenchSidebar onNavigate={onNavigate} />}
      windowBar={{
        searchLabel: "搜索作品、灵感、账号",
        notifications: <Notifications />,
        userMenu: <UserMenu />,
      }}
      overlays={
        <>
          <StoreHydration />
          <CommandPalette />
          <QuickCapture />
          <NewWorkDialog />
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
        keys: { n: () => setCaptureOpen(true), c: () => setNewWorkOpen(true) },
        help: HELP_ROWS,
      }}
    >
      {children}
    </ShellFrame>
  )
}
