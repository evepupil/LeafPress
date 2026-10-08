import { cn } from "cn"
import { Bookmark, Globe } from "lucide-react"

import { AccountTag } from "@/components/base/account-tag"
import { PlatformMark } from "@/components/base/marks"
import { ACCOUNTS } from "@/data/accounts"
import { BOOKMARKS } from "@/data/ideas"
import type { PlatformId } from "@/data/types"
import { formatDayShort } from "@/lib/format"
import { focusRing } from "@/lib/styles"

/** 把每个账号的对标账号摊平成一张清单，每条带上它属于哪个账号 */
const BENCHMARKS = ACCOUNTS.flatMap((account) => account.benchmarks.map((benchmark) => ({ account, benchmark })))

/** 收藏和对标行首的小图标：站外网页用地球，平台上的用平台标识 */
function SourceMark({ platform }: { platform: PlatformId | "web" }) {
  if (platform === "web") return <Globe className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
  return <PlatformMark platform={platform} size={14} className="mt-0.5" />
}

/** 收藏与对标：收藏过的网页链接，以及各个账号盯着的对标账号 */
export function Bookmarks() {
  return (
    <section id="bookmarks" aria-labelledby="bookmarks-title" className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
      <div className="flex h-10 items-center gap-2 border-b border-line px-3">
        <Bookmark className="size-4 shrink-0 text-fg-2" aria-hidden />
        <h2 id="bookmarks-title" className="truncate text-sm font-medium">
          收藏与对标
        </h2>
      </div>

      <div className="pb-1.5">
        <h3 className="px-3 pt-2.5 pb-1 text-xs font-medium text-fg-2">收藏</h3>
        {BOOKMARKS.length === 0 ? (
          <p className="px-3 py-2 text-sm text-fg-2">还没有收藏</p>
        ) : (
          <ul>
            {BOOKMARKS.map((bookmark) => (
              <li key={bookmark.id} data-bookmark={bookmark.id} className="flex min-w-0 items-start gap-2 px-3 py-1.5">
                <SourceMark platform={bookmark.platform} />
                <div className="min-w-0 flex-1">
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn("block truncate text-sm hover:underline", focusRing)}
                  >
                    {bookmark.title}
                  </a>
                  <p className="truncate text-xs text-fg-2">{bookmark.note}</p>
                </div>
                <span className="shrink-0 text-xs text-fg-2 tabular">{formatDayShort(bookmark.savedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="border-t border-line px-3 pt-2.5 pb-1 text-xs font-medium text-fg-2">对标账号</h3>
        {BENCHMARKS.length === 0 ? (
          <p className="px-3 py-2 text-sm text-fg-2">还没有对标账号</p>
        ) : (
          <ul>
            {BENCHMARKS.map(({ account, benchmark }) => (
              <li key={`${account.id}-${benchmark.name}`} data-benchmark className="flex min-w-0 items-start gap-2 px-3 py-1.5">
                <SourceMark platform={benchmark.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{benchmark.name}</p>
                  <p className="truncate text-xs text-fg-2">{benchmark.note}</p>
                </div>
                <AccountTag account={account} className="max-w-28 shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default Bookmarks
