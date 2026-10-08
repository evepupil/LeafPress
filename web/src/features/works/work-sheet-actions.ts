"use client"

import { toast } from "sonner"

import { copyText } from "@/lib/platform"

export async function copyWithToast(text: string, done = "已复制"): Promise<void> {
  if (await copyText(text)) toast.success(done)
  else toast("浏览器不让写剪贴板")
}

export function commitFocusedField(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}
