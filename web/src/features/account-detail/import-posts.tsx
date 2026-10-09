"use client"

import { Download } from "lucide-react"

import { Spinner } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { notify, toastFailure } from "@/lib/notify"
import { importPosts } from "@/state/actions/accounts"
import { runBusy, useBusy } from "@/state/busy"
import { describeImport } from "./import-summary"

/**
 * 「接入」里的「导入文章」：把平台上已有的内容导入成已完成的作品。
 * 导入要先准备检出目录，可能要几十秒，所以按钮在请求期间一直保持加载；
 * 忙标记放在全局，切到别的页面再回来按钮仍然是忙的，不会再点出第二个导入。
 */
export function ImportPosts({ accountId }: { accountId: string }) {
  const busyKey = `import:${accountId}`
  const importing = useBusy(busyKey)

  const run = () =>
    runBusy(busyKey, async () => {
      try {
        const { summary } = await importPosts(accountId)
        notify(describeImport(summary))
      } catch (error) {
        toastFailure(error, "导入失败")
      }
    })

  return (
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      data-import-posts
      disabled={importing}
      aria-busy={importing}
      onClick={() => void run()}
    >
      {importing ? <Spinner /> : <Download />}
      {importing ? "正在导入" : "导入文章"}
    </Button>
  )
}
