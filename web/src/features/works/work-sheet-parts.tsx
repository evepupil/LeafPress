import { cn } from "cn"
import type { ComponentProps, ReactNode } from "react"

import { Label } from "@/components/ui/label"

/** 属性里右边那一格：和下拉框、输入框同高、同样的内边距，纯文字的行才能和它们对齐 */
export const VALUE_CELL = "flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent px-2"

/** 属性下拉框：平时不画边，悬停才出现（照 DeverDesk 的属性行）；禁用时悬停也不变 */
export const QUIET_TRIGGER =
  "h-7 w-full justify-between border-transparent bg-transparent px-2 hover:border-line-2 hover:bg-card disabled:hover:border-transparent disabled:hover:bg-transparent"

/** 抽屉主体里的一段：上面一道分隔线，小标题在左，补充信息靠右 */
export function SheetSection({
  title,
  labelFor,
  titleExtra,
  aside,
  className,
  children,
  ...props
}: {
  /** 不写就没有标题行（属性那一段） */
  title?: string
  /** 标题是某个输入框的标签时，写那个输入框的 id */
  labelFor?: string
  /** 紧跟在标题后面的东西 */
  titleExtra?: ReactNode
  /** 靠右的东西 */
  aside?: ReactNode
} & Omit<ComponentProps<"section">, "title">) {
  return (
    <section className={cn("border-t border-line px-4 py-3", className)} {...props}>
      {title && (
        <div className="flex min-h-5 items-center gap-2 pb-2">
          {labelFor ? <Label htmlFor={labelFor}>{title}</Label> : <h3 className="text-xs font-medium text-fg-2">{title}</h3>}
          {titleExtra}
          {aside && <div className="ml-auto flex shrink-0 items-center">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** 属性网格里的一行：左边标签、右边控件。有 htmlFor 时标签点一下就聚焦到控件 */
export function FieldRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-fg-2">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}
