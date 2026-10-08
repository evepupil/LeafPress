"use client"

import { toast } from "sonner"

import { copyText } from "@/lib/platform"
import { useWorks } from "@/state/works"

/** 复制一段文字，成功和失败都给提示 */
export async function copyWithToast(text: string, done = "已复制"): Promise<void> {
  if (await copyText(text)) toast.success(done)
  else toast("浏览器不让写剪贴板")
}

/** 让 AI 做；做不了（工作流要配置、这一步要你来……）就把原因告诉用户。提示条上的按钮也走这里 */
export function runAiWithToast(id: string): void {
  const result = useWorks.getState().runAi(id)
  if (!result.ok) toast(result.reason)
}

/** 关抽屉前先让正在输入的框失焦：失焦才保存，直接关掉的话没保存的内容会丢 */
export function commitFocusedField(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement) active.blur()
}
