import { ChartColumn, FileText, LayoutDashboard, Lightbulb, NotebookPen, UsersRound, Workflow } from "lucide-react"

import { ACCOUNTS } from "@/data/accounts"
import { RUNS } from "@/data/tools"
import { PUBLICATIONS, WORKS } from "@/data/works"
import { INBOX } from "@/lib/metrics"

/** 侧栏第一组：七个页面。goKey 是「先按 G 再按它」的跳页键 */
export const PAGES = [
  { key: "home", label: "总览", path: "/", icon: LayoutDashboard, goKey: "h" },
  { key: "works", label: "作品", path: "/works/", icon: FileText, goKey: "w" },
  { key: "accounts", label: "账号", path: "/accounts/", icon: UsersRound, goKey: "a" },
  { key: "ideas", label: "灵感", path: "/ideas/", icon: Lightbulb, goKey: "i" },
  { key: "tools", label: "工具", path: "/tools/", icon: Workflow, goKey: "t" },
  { key: "data", label: "数据", path: "/data/", icon: ChartColumn, goKey: "d" },
  { key: "reports", label: "周报", path: "/reports/", icon: NotebookPen, goKey: "r" },
] as const

export type PageKey = (typeof PAGES)[number]["key"]

export type ViewKey = "waiting" | "pending" | "issues"

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
  { key: "waiting", label: "等我处理", path: "/tools/", query: { state: "waiting" } },
  { key: "pending", label: "待发", path: "/works/", query: { view: "pending" } },
  { key: "issues", label: "数据异常", path: "/data/", query: {}, hash: "#sources" },
]

/** 视图的完整地址：/tools/?state=waiting、/data/#sources */
export function viewHref(view: NavView): string {
  const search = new URLSearchParams(view.query).toString()
  return `${view.path}${search ? `?${search}` : ""}${view.hash ?? ""}`
}

/** 有待发版本的作品：作品状态是待发，或者有任何一个版本已排期、等回填链接 */
function countPendingWorks(): number {
  const withPendingVersion = new Set(
    PUBLICATIONS.filter((pub) => pub.state === "scheduled" || pub.state === "pending-link").map((pub) => pub.workId),
  )
  return WORKS.filter((work) => work.status === "ready" || withPendingVersion.has(work.id)).length
}

/** 三个视图旁边的数字，都从数据算出来 */
export const VIEW_COUNTS: Record<ViewKey, number> = {
  waiting: RUNS.filter((run) => run.state === "waiting").length,
  pending: countPendingWorks(),
  issues: INBOX.filter((item) => item.kind === "data" || item.kind === "manual").length,
}

/** 当前该高亮侧栏的哪一行 */
export type NavTarget = { kind: "view"; key: ViewKey } | { kind: "account"; id: string } | { kind: "page"; key: PageKey }

/** 去掉末尾斜杠，根路径保持 / */
export function trimSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  return trimmed === "" ? "/" : trimmed
}

function sameParams(params: URLSearchParams, expected: Readonly<Record<string, string>>): boolean {
  const names = Object.keys(expected)
  return Array.from(params.keys()).length === names.length && names.every((name) => params.get(name) === expected[name])
}

/**
 * 判断高亮哪一行，优先级从高到低：
 * 1. 地址和某个视图完全一致（路径 + 参数；视图带锚点时锚点也要一致）→ 高亮视图
 * 2. /accounts/<编号> → 高亮侧栏里那个账号
 * 3. 路径前缀匹配的页面（首页只在路径完全是 / 时匹配）
 */
export function resolveNav(pathname: string, params: URLSearchParams, hash: string): NavTarget | null {
  const path = trimSlash(pathname)

  for (const view of VIEWS) {
    if (path !== trimSlash(view.path)) continue
    if (view.hash !== undefined && hash !== view.hash) continue
    if (sameParams(params, view.query)) return { kind: "view", key: view.key }
  }

  const account = /^\/accounts\/([^/]+)$/.exec(path)
  if (account && ACCOUNTS.some((item) => item.id === account[1])) return { kind: "account", id: account[1] }

  const page = PAGES.find((item) => {
    const base = trimSlash(item.path)
    return base === "/" ? path === "/" : path === base || path.startsWith(`${base}/`)
  })
  return page ? { kind: "page", key: page.key } : null
}
