import { cn } from "cn"

import { PLATFORMS, type Account } from "@leafpress/core"
import { PlatformMark } from "./marks"

/** 账号名牌：平台标识 + 名字，可选再跟平台名（三个号都叫一叶之桐时靠它区分） */
export function AccountTag({
  account,
  size = "sm",
  showPlatform = false,
  className,
}: {
  account: Account
  size?: "sm" | "md"
  showPlatform?: boolean
  className?: string
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <PlatformMark platform={account.platform} size={size === "sm" ? 14 : 16} />
      <span className={size === "sm" ? "truncate text-xs text-fg-2" : "truncate text-sm text-fg"}>{account.name}</span>
      {showPlatform && <span className="shrink-0 text-xs text-fg-3">· {PLATFORMS[account.platform].name}</span>}
    </span>
  )
}
