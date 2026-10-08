"use client"

import { cn } from "cn"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { useSyncExternalStore, type ReactNode } from "react"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useData } from "@/state/data"
import { useUi } from "@/state/ui"
import { MobileNav } from "./mobile-nav"
import { CrumbProvider, type ShellCrumb } from "./shell-context"
import { GlobalShortcuts, ShortcutsDialog, type ShortcutConfig } from "./shortcuts"
import { ShellSkeleton } from "./shell-skeleton"
import { WindowBar, type WindowBarProps } from "./window-bar"

const subscribe = () => () => {}

export interface ShellFrameProps {
  /** 视图栏最左边的归属 */
  crumb: ShellCrumb
  /** 侧栏内容；手机抽屉里同样用它，传入关闭抽屉的回调 */
  sidebar: (onNavigate?: () => void) => ReactNode
  windowBar: WindowBarProps
  /** 详情侧栏、表单弹窗、搜索这类全局浮层 */
  overlays: ReactNode
  shortcuts: ShortcutConfig
  children: ReactNode
}

/**
 * 页面数据来自本机服务。服务端和首帧统一画骨架，浏览器订阅就绪后再渲染真实界面，避免两边内容对不上。
 */
export function ShellFrame(props: ShellFrameProps) {
  const status = useData((state) => state.status)
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  return ready && status !== "loading" ? <Frame {...props} /> : <ShellSkeleton />
}

function ConnectionNotice() {
  const error = useData((state) => state.error)
  const reconnecting = useData((state) => state.reconnecting)
  const retry = useData((state) => state.load)
  if (!error && !reconnecting) return null
  return (
    <div
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-raised px-3 py-2 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-bad" aria-hidden />
      <span className="font-medium">{reconnecting ? "正在重连本机服务" : "连不上本机服务"}</span>
      {error && !reconnecting && <span className="text-fg-2">请确认服务已启动</span>}
      {error && error.message !== "连接本机服务失败" && <span className="min-w-0 truncate text-fg-2">{error.message}</span>}
      {error?.hint && <span className="min-w-0 truncate text-fg-2">{error.hint}</span>}
      <button
        type="button"
        aria-busy={reconnecting}
        className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs hover:bg-hover"
        onClick={() => void retry()}
      >
        <RefreshCw className={cn("size-3.5", reconnecting && "animate-spin")} />
        {reconnecting ? "重试中" : "重试"}
      </button>
    </div>
  )
}

/**
 * 信息骨架（提炼）：38px 窗口栏 → 240px 固定导航 + 右侧工作区。
 * 背景分三级：窗口浅灰、工作区近白、卡片白。
 */
function Frame({ crumb, sidebar, windowBar, overlays, shortcuts, children }: ShellFrameProps) {
  const collapsed = useUi((state) => state.sidebarCollapsed)

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex h-dvh flex-col overflow-hidden bg-window text-fg">
        <WindowBar {...windowBar} />
        <div className="flex min-h-0 flex-1">
          <aside className={cn("hidden w-(--w-sidebar) shrink-0 lg:block", collapsed && "lg:hidden")}>{sidebar()}</aside>
          <main className={cn("flex min-w-0 flex-1 flex-col lg:pr-2 lg:pb-2", collapsed && "lg:pl-2")}>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-line-2 bg-panel lg:rounded-lg lg:border lg:shadow-xs">
              <CrumbProvider crumb={crumb}>
                <ConnectionNotice />
                {children}
              </CrumbProvider>
            </div>
          </main>
        </div>
      </div>
      <MobileNav>{(close) => sidebar(close)}</MobileNav>
      {overlays}
      <ShortcutsDialog rows={shortcuts.help} />
      <GlobalShortcuts config={shortcuts} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
