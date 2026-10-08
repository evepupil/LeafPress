export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" }

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) out.push({ kind: "text", text: text.slice(last, index) })
    const token = match[0]
    if (token.startsWith("**")) out.push({ kind: "strong", text: token.slice(2, -2) })
    else if (token.startsWith("`")) out.push({ kind: "code", text: token.slice(1, -1) })
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      if (link) out.push({ kind: "link", text: link[1] ?? "", href: link[2] ?? "" })
    }
    last = index + token.length
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) })
  return out
}

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const FENCE = /^```/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function cells(row: string): Inline[][] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInline(cell.trim()))
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", inline: parseInline(paragraph.join("\n")) })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (!line.trim()) {
      flush()
      continue
    }
    if (FENCE.test(line)) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i] ?? "")) code.push(lines[i++] ?? "")
      blocks.push({ kind: "code", text: code.join("\n") })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({
        kind: "heading",
        level: Math.min(3, heading[1]?.length ?? 3) as 1 | 2 | 3,
        inline: parseInline((heading[2] ?? "").trim()),
      })
      continue
    }
    if (RULE.test(line)) {
      flush()
      blocks.push({ kind: "rule" })
      continue
    }
    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flush()
      const header = cells(line)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i] ?? "")) rows.push(cells(lines[i++] ?? ""))
      i--
      blocks.push({ kind: "table", header, rows })
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (bullet || numbered) {
      flush()
      const ordered = !bullet
      const items: Inline[][] = []
      while (i < lines.length) {
        const match = ordered ? NUMBERED.exec(lines[i] ?? "") : BULLET.exec(lines[i] ?? "")
        if (!match) break
        items.push(parseInline(match[1] ?? ""))
        i++
      }
      i--
      blocks.push({ kind: "list", ordered, items })
      continue
    }
    const quote = QUOTE.exec(line)
    if (quote) {
      flush()
      const quoted: string[] = []
      while (i < lines.length) {
        const match = QUOTE.exec(lines[i] ?? "")
        if (!match) break
        quoted.push(match[1] ?? "")
        i++
      }
      i--
      blocks.push({ kind: "quote", inline: parseInline(quoted.join("\n")) })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

function plain(inline: Inline[]): string {
  return inline.map((item) => item.text).join("")
}

export function markdownSummary(source: string, maxLength = 80): string {
  const first = parseMarkdown(source).find((block) => block.kind === "paragraph")
  const text = first && first.kind === "paragraph" ? plain(first.inline).replace(/\s+/g, " ").trim() : ""
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}
