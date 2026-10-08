"use client"

import { useRouter } from "next/navigation"
import { Fragment, useEffect, useRef } from "react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { isTypingTarget, useIsMac } from "@/lib/platform"
import { useUi } from "@/state/ui"

/** 按下 G 之后，多久内再按页面键才算「先 G 再页面」 */
const GO_WINDOW_MS = 900

export interface ShortcutRow {
  label: string
  keys: string[]
}

export interface ShortcutConfig {
  /** 先按 G 再按这个键，跳到对应地址 */
  go: Record<string, string>
  /** 单键快捷键，比如 N 记灵感 */
  keys: Record<string, () => void>
  /** 快捷键弹窗里列出的条目（搜索、折叠侧栏、快捷键这几条通用的会自动加上） */
  help: ShortcutRow[]
}

/** 全局快捷键：⌘K / Ctrl+K 在输入框里也生效，单键在输入框里、弹窗和菜单打开时都不响应 */
export function GlobalShortcuts({ config }: { config: ShortcutConfig }) {
  const router = useRouter()
  // 监听函数只挂一次，配置变了从这里读最新的
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    // 按过 G 之后开一个短暂的等待窗口，窗口内再按页面键就跳页，超时作废
    let goTimer: ReturnType<typeof setTimeout> | null = null
    const cancelGo = () => {
      if (goTimer === null) return
      clearTimeout(goTimer)
      goTimer = null
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // 浏览器自动填充表单时会发出没有 key 的键盘事件，直接忽略
      if (typeof event.key !== "string") return
      const ui = useUi.getState()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || event.repeat || event.isComposing) return
      if (isTypingTarget(event.target)) return
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return

      const { go, keys } = configRef.current
      const key = event.key.toLowerCase()
      if (goTimer !== null && go[key]) {
        cancelGo()
        event.preventDefault()
        router.push(go[key])
        return
      }
      cancelGo()
      if (key === "g") {
        goTimer = setTimeout(() => {
          goTimer = null
        }, GO_WINDOW_MS)
        return
      }
      if (event.key === "?") {
        ui.setShortcutsOpen(true)
        return
      }
      if (event.key === "[") {
        ui.setSidebarCollapsed(!ui.sidebarCollapsed)
        return
      }
      const action = keys[key]
      if (action) {
        event.preventDefault()
        action()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      cancelGo()
    }
  }, [router])

  return null
}

export function ShortcutsDialog({ rows }: { rows: ShortcutRow[] }) {
  const open = useUi((state) => state.shortcutsOpen)
  const setOpen = useUi((state) => state.setShortcutsOpen)
  const isMac = useIsMac()
  const mod = isMac ? "⌘" : "Ctrl"

  const all: ShortcutRow[] = [
    { label: "搜索", keys: [mod, "K"] },
    ...rows,
    { label: "折叠侧栏", keys: ["["] },
    { label: "快捷键", keys: ["?"] },
  ]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-3 sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>快捷键</DialogTitle>
          <DialogDescription className="sr-only">全局快捷键一览</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] gap-y-2">
          {all.map((row) => (
            <Fragment key={row.label}>
              <dt className="text-sm text-fg-2">{row.label}</dt>
              <dd>
                <KbdGroup>
                  {row.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </Fragment>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
