import { ChartColumn, FileText, Lightbulb, NotebookPen, UsersRound, Workflow } from "lucide-react"

/** 侧栏第一组：六个页面。作品是首页。goKey 是「先按 G 再按它」的跳页键 */
export const PAGES = [
  { key: "works", label: "作品", path: "/", icon: FileText, goKey: "w" },
  { key: "ideas", label: "灵感", path: "/ideas/", icon: Lightbulb, goKey: "i" },
  { key: "accounts", label: "账号", path: "/accounts/", icon: UsersRound, goKey: "a" },
  { key: "workflows", label: "工作流", path: "/workflows/", icon: Workflow, goKey: "f" },
  { key: "data", label: "数据", path: "/data/", icon: ChartColumn, goKey: "d" },
  { key: "reports", label: "周报", path: "/reports/", icon: NotebookPen, goKey: "r" },
] as const

export type PageKey = (typeof PAGES)[number]["key"]

export type ViewKey = "waiting" | "todo" | "issues"

/** 侧栏第三组：带固定筛选的常用视图，点开是某个页面加参数 */
export interface NavView {
  key: ViewKey
  label: string
  path: string
  /** 地址栏参数。高亮时要求当前地址的参数和它完全一致 */
  query: Readonly<Record<string, string>>
  /** 没有参数的视图靠锚点和所在页面区分 */
  hash?: string
}

export const VIEWS: readonly NavView[] = [
  { key: "waiting", label: "等你处理", path: "/", query: { status: "waiting" } },
  { key: "todo", label: "待实现", path: "/", query: { status: "todo" } },
  { key: "issues", label: "数据异常", path: "/data/", query: {}, hash: "#sources" },
]

/** 视图的完整地址：/?status=waiting、/data/#sources */
export function viewHref(view: NavView): string {
  const search = new URLSearchParams(view.query).toString()
  return `${view.path}${search ? `?${search}` : ""}${view.hash ?? ""}`
}

/** 当前该高亮侧栏的哪一行 */
export type NavTarget = { kind: "view"; key: ViewKey } | { kind: "account"; id: string } | { kind: "page"; key: PageKey }

/** 去掉末尾斜杠，根路径保持 / */
export function trimSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}

/** 视图的参数都在、值一致就算这个视图（作品页打开详情时会多一个 open 参数，不影响高亮） */
function matchParams(params: URLSearchParams, expected: Readonly<Record<string, string>>): boolean {
  const names = Object.keys(expected)
  if (names.length === 0) return Array.from(params.keys()).length === 0
  return names.every((name) => params.get(name) === expected[name])
}

/**
 * 判断高亮哪一行，优先级从高到低：
 * 1. 地址和某个视图一致（路径 + 参数；视图带锚点时锚点也要一致）→ 高亮视图
 * 2. /account?id=<编号> → 高亮侧栏里那个账号
 * 3. 路径前缀匹配的页面（作品页只在路径完全是 / 时匹配）
 */
export function resolveNav(pathname: string, params: URLSearchParams, hash: string): NavTarget | null {
  const path = trimSlash(pathname)

  for (const view of VIEWS) {
    if (path !== trimSlash(view.path)) continue
    if (view.hash !== undefined && hash !== view.hash) continue
    if (matchParams(params, view.query)) return { kind: "view", key: view.key }
  }

  const accountId = path === "/account" ? params.get("id") : null
  if (accountId) return { kind: "account", id: accountId }

  const page = PAGES.find((item) => {
    const base = trimSlash(item.path)
    return base === "/" ? path === "/" : path === base || path.startsWith(`${base}/`)
  })
  return page ? { kind: "page", key: page.key } : null
}
