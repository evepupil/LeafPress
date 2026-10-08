"use client"

import { cn } from "cn"

import { AccountTag } from "@/components/base/account-tag"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounts } from "@/state/data"

const NO_ACCOUNT = "none"

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
  const accounts = useAccounts()
  return (
    <Select value={value ?? NO_ACCOUNT} onValueChange={(next) => onChange(next === NO_ACCOUNT ? undefined : next)}>
      <SelectTrigger id={id} aria-label="账号" className={cn("h-7 text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={NO_ACCOUNT}>不挂账号</SelectItem>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <AccountTag account={account} size="md" showPlatform />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
