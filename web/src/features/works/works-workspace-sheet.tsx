"use client"

import { cn } from "cn"
import { Copy } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { AccountTag } from "@/components/base/account-tag"
import { LabeledBars } from "@/components/base/bars"
import { WorkStatusIcon } from "@/components/base/state-icons"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { RUN_STATE_LABEL, WORK_STATUS_LABEL } from "@/data/labels"
import { RUNS } from "@/data/tools"
import type { Publication } from "@/data/types"
import { formatDay } from "@/lib/format"
import { toolName, type WorkRow } from "@/lib/metrics"
import { focusRing } from "@/lib/styles"
import { ORIGIN_LABEL, lengthText, orderPubs, recentReads } from "./works-workspace-model"
import { ColumnLabel, copyWithToast } from "./works-workspace-parts"
import { PubBlock } from "./works-workspace-sheet-pubs"

/**
 * 作品详情抽屉，从右边滑出。`open` 单独传：关掉时内容还在，抽屉才能把滑出动画演完。
 * 手机上占满整宽，桌面宽度上限 560px（抽屉组件自带的宽度写在 data 变体上，所以这里也用 data 变体盖过去）。
 */
export function WorkSheet({
  row,
  open,
  onClose,
  onBackfill,
  onCloseAutoFocus,
}: {
  row: WorkRow
  open: boolean
  onClose(): void
  onBackfill(pub: Publication, url: string): void
  /** 抽屉关掉后焦点去哪：交给外面，让它回到打开抽屉的那张卡片或那一行 */
  onCloseAutoFocus(event: Event): void
}) {
  const { work } = row
  const pubs = orderPubs(row.pubs)
  const reads = recentReads(row.pubs)
  const run = work.runId ? RUNS.find((item) => item.id === work.runId) : undefined

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        data-work-sheet
        // 打开时让焦点落在抽屉本身：默认会落到第一个图标按钮上，弹出它的提示条，还得多按一次 Esc 才关得掉
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.target instanceof HTMLElement) event.target.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-full gap-0 p-0 outline-none sm:max-w-[560px] data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]"
      >
        <div className="border-b border-line px-4 py-3 pr-11">
          <div className="flex items-center gap-2 text-xs text-fg-2">
            <WorkStatusIcon status={work.status} />
            <span className="shrink-0">{WORK_STATUS_LABEL[work.status]}</span>
            <span aria-hidden>·</span>
            <ColumnLabel work={work} />
          </div>
          <SheetTitle className="mt-1 text-sm font-medium break-words" data-work-sheet-title>
            {work.title}
          </SheetTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-2">
            <AccountTag account={row.account} showPlatform />
            <span>创建于 {formatDay(work.createdAt)}</span>
          </div>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            <SheetSection title="各平台版本">
              {pubs.length === 0 ? (
                <p className="text-sm text-fg-2">还没有版本</p>
              ) : (
                pubs.map((pub) => <PubBlock key={pub.id} pub={pub} onBackfill={onBackfill} />)
              )}
            </SheetSection>

            <SheetSection title="近 14 天阅读">
              {reads.total === 0 ? <p className="text-sm text-fg-2">还没有阅读数据</p> : <LabeledBars data={reads.data} height={72} />}
            </SheetSection>

            <SheetSection title="来源">
              <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-fg-2">原稿</dt>
                <dd className="min-w-0">{work.sourceRef ? <span className="font-mono text-xs break-all">{work.sourceRef}</span> : "—"}</dd>
                <dt className="text-fg-2">写在</dt>
                <dd className="min-w-0">{ORIGIN_LABEL[work.origin]}</dd>
                <dt className="text-fg-2">篇幅</dt>
                <dd className="min-w-0 tabular">{lengthText(work)}</dd>
                {run && (
                  <>
                    <dt className="text-fg-2">工具</dt>
                    <dd className="min-w-0">
                      <Link
                        href={`/tools/?run=${run.id}`}
                        className={cn("rounded-sm text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg-2", focusRing)}
                      >
                        {toolName(run.toolId)} · {RUN_STATE_LABEL[run.state]}
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
            </SheetSection>

            {work.note && (
              <SheetSection title="备注">
                <p className="rounded-md bg-raised px-3 py-2 text-sm break-words">{work.note}</p>
              </SheetSection>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-line px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => copyWithToast(work.title)}>
            <Copy />
            复制标题
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="pb-1.5 text-xs font-medium text-fg-2">{title}</h3>
      {children}
    </section>
  )
}
