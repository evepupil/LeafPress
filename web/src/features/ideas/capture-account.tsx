"use client"

import { cn } from "cn"

import { AccountTag } from "@/components/base/account-tag"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ACCOUNTS } from "@/data/accounts"

/** 下拉的选项值不能是空字符串，「不挂账号」用这个占位值 */
const NO_ACCOUNT = "none"

/** 挂哪个账号的下拉：速记框和灵感抽屉共用。没挂账号时 value 为空 */
export function AccountSelect({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: string | undefined
  onChange(accountId: string | undefined): void
  className?: string
}) {
  return (
    <Select value={value ?? NO_ACCOUNT} onValueChange={(next) => onChange(next === NO_ACCOUNT ? undefined : next)}>
      <SelectTrigger id={id} aria-label="账号" className={cn("h-7 text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      {/* 速记框在页面上方，默认的「对齐选中项」会把靠后的选项顶出屏幕，改成从触发器下方弹出 */}
      <SelectContent position="popper">
        <SelectItem value={NO_ACCOUNT}>不挂账号</SelectItem>
        {ACCOUNTS.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <AccountTag account={account} size="md" showPlatform />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
