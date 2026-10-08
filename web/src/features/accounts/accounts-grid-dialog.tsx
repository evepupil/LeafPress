"use client"

import { useRef, useState } from "react"

import { Field } from "@/components/base/field"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PLATFORMS } from "@/data/accounts"
import type { PlatformId } from "@/data/types"

/** 弹窗交给账号网格的结果：名字和定位已去掉首尾空白 */
export interface NewAccount {
  platform: PlatformId
  name: string
  positioning: string
}

const PLATFORM_LIST = Object.values(PLATFORMS)
const DEFAULT_PLATFORM: PlatformId = "zhihu"

/**
 * 加账号弹窗。三个字段的状态放在这里，由外面用 key 控制「每次打开是一份新表单」：
 * 上次填的内容不会带到下一次，关闭动画里字段也不会提前清空。
 */
export function AddAccountDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onAdd(account: NewAccount): void
}) {
  const [platform, setPlatform] = useState<PlatformId>(DEFAULT_PLATFORM)
  const [name, setName] = useState("")
  const [positioning, setPositioning] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const canSubmit = name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-[440px]"
        onOpenAutoFocus={(event) => {
          // 平台已有默认值，打开后光标直接落在名字上
          event.preventDefault()
          nameRef.current?.focus()
        }}
      >
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle>加账号</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="contents"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return
            onAdd({ platform, name: name.trim(), positioning: positioning.trim() })
            onOpenChange(false)
          }}
        >
          <div className="flex flex-col gap-3 px-4 py-4">
            <Field id="new-account-platform" label="平台">
              <Select
                value={platform}
                onValueChange={(value) => {
                  const next = PLATFORM_LIST.find((item) => item.id === value)
                  if (next) setPlatform(next.id)
                }}
              >
                <SelectTrigger id="new-account-platform" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {PLATFORM_LIST.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <PlatformMark platform={item.id} size={14} />
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="new-account-name" label="名字">
              <Input
                ref={nameRef}
                id="new-account-name"
                data-new-account-name
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field id="new-account-positioning" label="定位">
              <Textarea
                id="new-account-positioning"
                rows={2}
                placeholder="一句话：写什么、写给谁"
                value={positioning}
                onChange={(event) => setPositioning(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="border-t border-line px-4 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {/* 名字为空时按钮禁用；表单里按回车也走同一条提交路径，空名字不会通过 */}
            <Button type="submit" data-new-account-submit disabled={!canSubmit}>
              加上
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
