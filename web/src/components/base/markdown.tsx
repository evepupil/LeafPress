import { cn } from "cn"
import { type ComponentProps, Fragment, type ReactNode } from "react"

import { parseMarkdown, type Block, type Inline } from "@leafpress/core"

/**
 * 把 Markdown 排成页面上的文字（账号档案用）。只用三档字号：标题靠字重和上下间距区分。
 * 解析使用 @leafpress/core，这里只把块变成 React 元素，不插入 HTML 字符串。
 */

function renderInline(items: Inline[]): ReactNode {
  return items.map((item, index) => {
    switch (item.kind) {
      case "strong":
        return (
          <strong key={index} className="font-medium">
            {item.text}
          </strong>
        )
      case "code":
        return (
          <code key={index} className="rounded-sm bg-raised px-1 font-mono text-xs">
            {item.text}
          </code>
        )
      case "link":
        return (
          <a key={index} href={item.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg-2">
            {item.text}
          </a>
        )
      default:
        return <Fragment key={index}>{item.text}</Fragment>
    }
  })
}

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.kind) {
    case "heading":
      return block.level === 1 ? (
        <h3 key={index} className="mt-5 text-sm font-medium first:mt-0">
          {renderInline(block.inline)}
        </h3>
      ) : (
        <h4 key={index} className={cn("mt-4 font-medium first:mt-0", block.level === 2 ? "text-sm" : "text-xs text-fg-2")}>
          {renderInline(block.inline)}
        </h4>
      )
    case "paragraph":
      return (
        <p key={index} className="mt-1.5 whitespace-pre-wrap first:mt-0">
          {renderInline(block.inline)}
        </p>
      )
    case "list": {
      const List = block.ordered ? "ol" : "ul"
      return (
        <List key={index} className={cn("mt-1.5 flex flex-col gap-0.5 pl-5 first:mt-0", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>
      )
    }
    case "quote":
      return (
        <blockquote key={index} className="mt-1.5 border-l-2 border-line-3 pl-3 whitespace-pre-wrap text-fg-2 first:mt-0">
          {renderInline(block.inline)}
        </blockquote>
      )
    case "code":
      return (
        <pre key={index} className="scroll-thin mt-1.5 overflow-x-auto rounded-md bg-raised px-3 py-2 font-mono text-xs first:mt-0">
          {block.text}
        </pre>
      )
    case "table":
      return (
        <div key={index} className="scroll-thin mt-1.5 overflow-x-auto first:mt-0">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="bg-raised text-left text-xs text-fg-2">
                {block.header.map((cell, cellIndex) => (
                  <th key={cellIndex} scope="col" className="border border-line px-2 py-1 font-normal">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-line px-2 py-1 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "rule":
      return <hr key={index} className="mt-3 border-line first:mt-0" />
  }
}

export function Markdown({ source, className, ...props }: { source: string } & Omit<ComponentProps<"div">, "children">) {
  return (
    <div className={cn("min-w-0 text-sm leading-relaxed break-words", className)} {...props}>
      {parseMarkdown(source).map(renderBlock)}
    </div>
  )
}
