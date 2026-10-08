"use client"

import { useRef, useState } from "react"

import { Field } from "@/components/base/field"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PlatformId } from "@leafpress/core"
import { PLATFORMS, PLATFORM_ORDER } from "@leafpress/core"

/** 弹窗交给账号网格的结果：名字和定位已去掉首尾空白 */
export interface NewAccount {
  platform: PlatformId
  name: string
  intro: string
}

const DEFAULT_PLATFORM: PlatformId = "zhihu"

/**
 * 加账号弹窗。平台、名字和定位在这里编辑；接入参数在账号详情页配置。
 * 状态放在弹窗内，由外面用 key 控制「每次打开是一份新表单」。
 */
export function AddAccountDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onAdd(account: NewAccount): Promise<boolean>
}) {
  const [platform, setPlatform] = useState<PlatformId>(DEFAULT_PLATFORM)
  const [name, setName] = useState("")
  const [positioning, setPositioning] = useState("")
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const canSubmit = name.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[440px]"
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
          onSubmit={async (event) => {
            event.preventDefault()
            if (!canSubmit || saving) return
            setSaving(true)
            try {
              const added = await onAdd({ platform, name: name.trim(), intro: positioning.trim() })
              if (added) onOpenChange(false)
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              <Field id="new-account-platform" label="平台">
                <Select
                  value={platform}
                  onValueChange={(value) => {
                    const next = PLATFORM_ORDER.find((item) => item === value)
                    if (next) setPlatform(next)
                  }}
                >
                  <SelectTrigger id="new-account-platform" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {PLATFORM_ORDER.map((id) => {
                      const item = PLATFORMS[id]
                      return (
                        <SelectItem key={item.id} value={item.id}>
                          <PlatformMark platform={item.id} size={14} />
                          {item.name}
                        </SelectItem>
                      )
                    })}
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
          </div>
          <DialogFooter className="border-t border-line px-4 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            {/* 名字为空时按钮禁用；表单里按回车也走同一条提交路径，空名字不会通过 */}
            <Button type="submit" data-new-account-submit disabled={!canSubmit || saving}>
              加上
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
