import "@fontsource-variable/inter"
import "./globals.css"

import type { Metadata, Viewport } from "next"
import { Suspense } from "react"

import { ShellSkeleton } from "@/features/shell/shell-skeleton"

export const metadata: Metadata = {
  title: "LeafPress",
  description: "个人自媒体工作台：作品、账号方向、灵感、工具和数据放在一起。",
}

export const viewport: Viewport = {
  themeColor: "#f2f2f3",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 各区块会读地址栏参数，静态导出时外面要有这一层 */}
        <Suspense fallback={<ShellSkeleton />}>{children}</Suspense>
      </body>
    </html>
  )
}
