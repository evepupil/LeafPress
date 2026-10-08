"use client"

import { create } from "zustand"

/** 界面开关：命令面板、速记、新建作品、快捷键弹窗、手机导航、侧栏折叠。不持久化 */
interface UiState {
  commandOpen: boolean
  setCommandOpen(open: boolean): void
  captureOpen: boolean
  setCaptureOpen(open: boolean): void
  newWorkOpen: boolean
  setNewWorkOpen(open: boolean): void
  shortcutsOpen: boolean
  setShortcutsOpen(open: boolean): void
  mobileNavOpen: boolean
  setMobileNavOpen(open: boolean): void
  sidebarCollapsed: boolean
  setSidebarCollapsed(collapsed: boolean): void
}

export const useUi = create<UiState>((set) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  captureOpen: false,
  setCaptureOpen: (captureOpen) => set({ captureOpen }),
  newWorkOpen: false,
  setNewWorkOpen: (newWorkOpen) => set({ newWorkOpen }),
  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
}))
