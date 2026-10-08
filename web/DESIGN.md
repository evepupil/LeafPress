# LeafPress 自媒体工作台 —— 站点层规格（唯一事实来源）

> 所有实现会话动手前先读完本文件，再读 `design/` 下属于自己那一页的规格。本文件和 `design/*.md` 是契约，**实现会话不得修改**。
> 这份规格故意写满：这类工作台该有的东西全部先摆上，数据是编好的。删减是主控验收时的事，实现会话只负责按规格做出来。
> 规格分两层：本文件定全站的东西，**每路必读全文**；`design/<页面>.md` 写逐区块规格，**每路只读自己那一页**。

---

## 0. 定位与参照

一个人运营多个自媒体账号的控制台：作品、账号方向、灵感、工具和数据放在一起，每周看一眼就知道哪个方向有效、下一步做什么。这一版是**可点击的原型**：数据全部写死在 `src/data`，所有交互只改浏览器内存里的状态，刷新就复原。

用户来这里干这几件事：

1. 打开总览，看今天有哪些事在等自己（回填链接、校对字幕、确认大纲、数据拉取失败、断更）
2. 看每个账号的方向、粉丝、这周发了几篇
3. 记一条灵感，或者把灵感转成作品
4. 找到一个工具（博客改投知乎、录屏成片……），看它最近跑得怎样
5. 看数据走势和每周周报

目标观感：**和 DeverDesk 一模一样的安静工作台：窄导航、宽工作区、小字号、浅灰到白的三级底色，颜色只用来识别平台和状态，数字一眼可读。**

| 参照 | 抄什么 |
|---|---|
| DeverDesk（`C:\code\DeverDesk`，用户自己的项目，规格见它的 `docs/前端设计.md`） | 整套外壳（38px 窗口栏、240px 侧栏、近白工作区面板）、令牌、shadcn 组件、看板列 `BoardColumn`、白卡片 `Surface`、标签 `LabelChip`、状态图形 `StatusIcon`、涨跌 `Delta`、主图卡（指标做成页签，见 `src/features/insights/insight-chart.tsx`）、周回顾页的版式（`src/features/review/review-page.tsx`） |
| Linear（凭记忆） | 列表行 32px、整行悬停变浅灰、属性用小标签不用彩色块 |
| 知乎创作中心「内容分析」、B站创作中心「数据中心」（凭记忆） | 作品数据表的列：阅读、赞同、收藏、评论、近 7 天增长；按单篇排行 |
| 新榜（凭记忆） | 多账号一张表横着比：粉丝、增减、发布数 |

不抄：DeverDesk 的任务、计时、收支、例行、多语言、登录、同步图标、AI 提议卡；创作中心的大面积彩色卡片、统计卡片墙、横幅广告、排名奖杯。

### 0.1 页面清单

| 页面 | 路由 | 用户来干什么 | 首屏核心动作 | 参照页 | 区块下限 | 分路 |
|---|---|---|---|---|---|---|
| 总览 | `/` | 看今天要处理的事和各账号状态 | 「待处理」列表里每一行的动作按钮 | DeverDesk 今天页 + 回顾页 | 7 | L1、L2 |
| 作品 | `/works/` | 找作品、看它在各平台的版本和数据 | 看板 / 列表切换 + 筛选 + 点开详情 | DeverDesk 任务页（看板与列表） | 1（整页一个工作区，内部 4 部分） | L3 |
| 账号 | `/accounts/` | 看在做哪些号、各自方向 | 点账号卡片进详情 | DeverDesk 副业看板 | 3 | L4 |
| 账号详情 | `/accounts/[id]/` | 看一个号的方向档案和数据 | 方向档案（可编辑） | DeverDesk 副业详情侧栏 + 概览页 | 6 | L5 |
| 灵感 | `/ideas/` | 记灵感、挑能写的 | 顶部速记框 | DeverDesk 任务看板 | 4 | L6 |
| 工具 | `/tools/` | 找工具、看运行记录 | 工具卡片墙 | 无现成参照，按 DeverDesk 副业卡片的三层信息写 | 3 | L7 |
| 数据 | `/data/` | 看走势、排行、数据来源 | 主图卡切换指标 | DeverDesk 概览页 + 知乎内容分析 | 5 | L8 |
| 周报 | `/reports/` | 看一周小结、写复盘 | 周切换 + 小结 | DeverDesk 回顾页 | 7 | L9 |

---

## 1. 技术栈（已锁定）

| 项 | 值 |
|---|---|
| 框架 | Next.js 16.3.6（App Router），`output: "export"`，`trailingSlash: true`，`images.unoptimized: true` |
| 语言 | TypeScript 5.9，`strict: true` + `noUnusedLocals` + `noUnusedParameters`（`tsconfig.json` 已写好，不要改） |
| 样式 | Tailwind CSS 4.3（`@tailwindcss/postcss`）+ `tw-animate-css` + `shadcn/tailwind.css` |
| 组件 | shadcn（radix-ui 1.6.7）、cmdk、sonner；类名合并用 `cn` 包（`import { cn } from "cn"`） |
| 状态 | zustand 5（只放跨区块共享的界面状态，见 4.5） |
| 图标 | lucide-react 1.48.0，只用下面白名单 |
| 图表 | recharts 3.8.0（只有共享的 `MetricChartCard` 用它）；小柱状图、进度条一律手写 SVG / div |
| 字体 | `@fontsource-variable/inter`（根布局里 import） |
| 单测 | vitest 5（只测 `src/data`、`src/lib`，已写好） |
| 包管理 | pnpm（依赖已装好，**不要再装**） |

**不引入**：任何别的依赖。尤其不准加 framer-motion / motion、任何图表库、日期库（dayjs、date-fns）、图标库、UI 框架、状态库、`next/image`。

**站内链接**一律用 `next/link` 的 `Link`，地址带尾斜杠：`/works/`、`/accounts/zhihu-yiye/`、带参数写成 `/works/?open=w-claude-md`。**站外链接**用 `<a href target="_blank" rel="noreferrer">`。

可用图标白名单（已在 lucide-react 1.48.0 逐个确认存在，只用这些，按需 import）：
`LayoutDashboard FileText Files UsersRound UserRound Lightbulb Workflow ChartColumn ChartLine NotebookPen CalendarRange CalendarDays Search Bell Plus SquarePen ChevronRight ChevronLeft ChevronDown ChevronUp ArrowUpRight ArrowDownRight ArrowLeft ArrowRight ArrowUpDown ExternalLink Link Link2 Copy Check CheckCheck X Clock Timer Play Pause RefreshCw RotateCcw CircleAlert TriangleAlert Info Sparkles Bot Video Image Images Film Mic Captions Scissors Clapperboard Newspaper PenLine Pencil BookOpen Bookmark Inbox Archive Tag Hash Target Flag Eye Heart ThumbsUp MessageSquare MessageCircle Star Share2 TrendingUp TrendingDown Download Upload Filter ListFilter SlidersHorizontal LayoutGrid List Kanban Menu PanelLeft Keyboard Settings Database CloudDownload Server Terminal Command Leaf Calendar CircleDot Circle Ellipsis Trash2 Send Repeat History FolderGit2 GitCommitHorizontal Globe Rss Feather Layers WandSparkles Hourglass CircleCheck CircleX LoaderCircle Users Mail Quote ScrollText ClipboardCheck ClipboardList ListChecks Gauge Activity Zap Hand Tv MonitorPlay Smartphone`。
需要别的形状就手写内联 SVG。

---

## 2. 设计令牌

**令牌和 DeverDesk 完全一致**：`src/styles/tokens.css` 逐字复制 `C:\code\DeverDesk\src\styles\tokens.css`；`src/app/globals.css` 逐字复制 `C:\code\DeverDesk\src\app\globals.css`。数值以那两个文件为准，下面列出各区块要用的工具类名。

### 2.1 颜色（工具类 → 值 → 用途）

| 类名 | 值 | 用途 |
|---|---|---|
| `bg-window` | #f2f2f3 | 窗口底（窗口栏、侧栏） |
| `bg-panel` | #fbfbfb | 工作区面板 |
| `bg-column` | #f4f4f5 | 看板列、分组底 |
| `bg-card` | #ffffff | 卡片、表格、输入框 |
| `bg-raised` | #f7f7f8 | 未选中的页签、表头 |
| `text-fg` | #1c1c20 | 正文、标题（对比度 16:1） |
| `text-fg-2` | #62626b | 次要文字、说明、表头（对比度 5.9:1） |
| `text-fg-3` | #8f8f98 | **只给图标、占位文字、禁用态**，不做正文（对比度 3.2:1） |
| `border-line` / `border-line-2` / `border-line-3` | #ebebee / #e2e2e6 / #d0d0d6 | 低对比线：卡片边 / 输入框边 / 悬停加深 |
| `bg-hover` / `bg-pressed` / `bg-selected` | 半透明黑 4.5% / 8% / 6.5% | 悬停、按下、选中 |
| `text-good` / `text-bad` / `text-warn` | #1f8a53 / #cf3035 / #8a6100 | 涨跌和警示**文字**，只用在 12～13px 小字上 |
| `bg-ink` / `text-ink` | #2b2b31 | 图表主色、进度条填充 |
| `var(--team)` #2f9e62、`var(--progress)` #e5a50a、`var(--done)` #6e56cf、`var(--risk)` #e5484d、`var(--idle)` #a1a1a9 | | 状态图形和小色点，**只做图形，不做文字**（黄色在白底上对比度不够） |
| `var(--label-red|orange|amber|green|teal|blue|indigo|violet|pink|gray)` | | 平台标识方块、栏目小色点、标签色点 |

平台颜色取 `PLATFORMS[platform].color`：博客 green、知乎 blue、公众号 teal、B站 pink、小红书 red。

**组件里禁止写十六进制色值**。例外：`MetricChartCard` 里 recharts 的 `stroke` / `fill` 写 `var(--chart-ink)` 这类变量；`style={{ background: \`var(--label-${color})\` }}` 这种按数据取色的写法。

### 2.2 字阶与排版

- 字族：`--font-sans`（Inter Variable 接中文系统黑体），等宽 `font-mono`。
- 只有三档字号：`text-xs`（12/16，辅助、表头、标签）、`text-sm`（13/17，正文，默认）、`text-xl`（20/24，只用在主图卡页签的大数字和账号详情的粉丝数）。**不准用 text-base、text-lg、text-2xl 及以上**。
- 字重只用 `font-normal`（400）和 `font-medium`（500）。页面不放大标题；页面名只在视图栏里用 13px `font-medium`。
- 所有数字加 `tabular`（等宽数字）。

### 2.3 间距、圆角、阴影、断点

- 骨架：窗口栏 `h-(--h-windowbar)` 38px，侧栏 `w-(--w-sidebar)` 240px，视图栏、筛选栏各 40px。
- 工作区内容外边距 `p-3`，手机底部多留 `pb-20 lg:pb-3`（给右下角的速记按钮让位）。
- 卡片之间 `gap-(--gap-card)`（8px）；卡片内边距 `px-3 py-2.5`（列表卡）或 `px-4 py-3`（大卡）。
- 列表行高 `h-8`（32px）；表格行高 `h-9`（36px）；看板列标题行 `h-9`。
- 圆角：控件 `rounded-md`（5px），卡片 `rounded-lg`（6px），弹窗 `rounded-xl`（8px）。
- 阴影：卡片 `shadow-sm`，浮层 `shadow-md`，弹窗 `shadow-lg`。
- 焦点：可点的元素一律加 `focusRing`（`@/lib/styles`），整行可点的用 `focusRingInset`。
- 断点：Tailwind 默认（sm 640、md 768、lg 1024、xl 1280）。侧栏 `lg` 以下收进抽屉。**验收看两档：桌面 1440×900、手机 390×844。**

### 2.4 全局样式

`globals.css` 已有、区块直接用的类：`focus-ring`、`scroll-thin`（细滚动条）、`tabular`（等宽数字）；`no-scrollbar`（隐藏滚动条）由 `shadcn/tailwind.css` 提供。不追加别的全局样式。

---

## 3. 动效纪律

这是工作台，**几乎不动**：

- 可以动：悬停、按下的底色和边框颜色（`transition-colors duration-(--dur-fast)`）；弹窗、抽屉、下拉的出现消失（shadcn 自带的 tw-animate-css 动画，不改）；`LoaderCircle` 的 `animate-spin` 只用在「运行中」状态，这是唯一的循环动画。
- 不准动：入场动画、滚动视差、数字滚动、悬停放大或上浮、骨架闪烁之外的任何循环、图表入场动画（recharts 一律 `isAnimationActive={false}`）。
- `prefers-reduced-motion` 已在 `globals.css` 里统一关掉。

---

## 4. 文件结构与共享组件

```
web/
├── DESIGN.md、design/          规格（不准改）
├── src/app/                     路由（地基路写）
├── src/components/ui/           shadcn 组件（从 DeverDesk 复制）
├── src/components/base/         基础组件（从 DeverDesk 复制 + 本项目新增）
├── src/components/charts/       MetricChartCard
├── src/features/shell/          外壳：窗口栏、侧栏、视图栏、命令面板、提醒、速记
├── src/features/<页面>/         各页区块（区块路写）
├── src/state/                   zustand 共享状态
├── src/lib/                     format.ts、metrics.ts（主控已写，不准改）、styles.ts、utils.ts
└── src/data/                    演示数据（主控已写，不准改）
```

### 4.1 路由与页面骨架（地基路逐字写这些页面文件）

| 路由 | 文件 | 视图栏标题 |
|---|---|---|
| `/` | `src/app/(workbench)/page.tsx` | 总览 |
| `/works/` | `src/app/(workbench)/works/page.tsx` | 作品 |
| `/accounts/` | `src/app/(workbench)/accounts/page.tsx` | 账号 |
| `/accounts/[id]/` | `src/app/(workbench)/accounts/[id]/page.tsx` | 账号名 |
| `/ideas/` | `src/app/(workbench)/ideas/page.tsx` | 灵感 |
| `/tools/` | `src/app/(workbench)/tools/page.tsx` | 工具 |
| `/data/` | `src/app/(workbench)/data/page.tsx` | 数据 |
| `/reports/` | `src/app/(workbench)/reports/page.tsx` | 周报 |

根布局 `src/app/layout.tsx`：照 DeverDesk 的根布局，去掉 `Analytics`、`HtmlLang`；`metadata.title` 为 `"LeafPress"`，`description` 为 `"个人自媒体工作台：作品、账号方向、灵感、工具和数据放在一起。"`；`<html lang="zh-CN">`；`<body>` 里 `<Suspense fallback={<ShellSkeleton />}>{children}</Suspense>`（各区块会读地址栏参数，静态导出需要这层）。
工作台布局 `src/app/(workbench)/layout.tsx`：`<WorkbenchShell>{children}</WorkbenchShell>`。
`src/app/not-found.tsx`：照 DeverDesk 的写，文字「这个页面不存在」，按钮「回到总览」链到 `/`。

各页面文件的内容（**区块组件不接收参数**，唯一例外是账号详情页的区块接收 `accountId: string`）：

```tsx
// src/app/(workbench)/page.tsx
import { TODAY } from "@/data/clock"
import { HomeAccounts } from "@/features/home/accounts-pulse"
import { HomeCadence } from "@/features/home/cadence"
import { HomeCapture } from "@/features/home/capture"
import { HomeInbox } from "@/features/home/inbox"
import { HomeMovers } from "@/features/home/movers"
import { HomeRuns } from "@/features/home/runs"
import { HomeSummaryBar } from "@/features/home/summary-bar"
import { PageFrame } from "@/features/shell/page-frame"
import { formatDay, weekdayLabel } from "@/lib/format"

export default function Page() {
  return (
    <PageFrame
      title="总览"
      meta={<span className="hidden truncate sm:inline">{`${formatDay(TODAY)} ${weekdayLabel(TODAY)}`}</span>}
      filterBar={<HomeSummaryBar />}
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-2">
          <HomeInbox />
          <HomeCadence />
          <HomeMovers />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <HomeAccounts />
          <HomeCapture />
          <HomeRuns />
        </div>
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/works/page.tsx —— 作品页的视图栏、筛选栏都在工作区组件里（它们共用筛选状态）
import { WorksWorkspace } from "@/features/works/works-workspace"

export default function Page() {
  return <WorksWorkspace />
}
```

```tsx
// src/app/(workbench)/accounts/page.tsx
import { ACCOUNTS } from "@/data/accounts"
import { AccountsGrid } from "@/features/accounts/accounts-grid"
import { DirectionMatrix } from "@/features/accounts/direction-matrix"
import { PrepBoard } from "@/features/accounts/prep-board"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="账号" meta={<span className="tabular">{ACCOUNTS.length}</span>}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <AccountsGrid />
        <DirectionMatrix />
        <PrepBoard />
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/accounts/[id]/page.tsx
import { ExternalLink } from "lucide-react"
import { ACCOUNTS, PLATFORMS, accountById } from "@/data/accounts"
import { STAGE_LABEL } from "@/data/labels"
import { PlatformMark } from "@/components/base/marks"
import { Button } from "@/components/ui/button"
import { AccountHeader } from "@/features/account-detail/header"
import { AccountSource } from "@/features/account-detail/source"
import { AccountTrend } from "@/features/account-detail/trend"
import { AccountWorks } from "@/features/account-detail/works"
import { ColumnTable } from "@/features/account-detail/columns"
import { DirectionCard } from "@/features/account-detail/direction"
import { PageFrame } from "@/features/shell/page-frame"

export const dynamicParams = false

export function generateStaticParams() {
  return ACCOUNTS.map((account) => ({ id: account.id }))
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const account = accountById(id)
  return (
    <PageFrame
      title={account.name}
      meta={
        <span className="flex items-center gap-1.5">
          <PlatformMark platform={account.platform} size={14} />
          <span className="hidden sm:inline">{`${PLATFORMS[account.platform].name} · ${STAGE_LABEL[account.stage]}`}</span>
        </span>
      }
      actions={
        <Button variant="outline" size="sm" asChild>
          <a href={account.url} target="_blank" rel="noreferrer">
            <ExternalLink />
            打开主页
          </a>
        </Button>
      }
    >
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-2">
          <AccountHeader accountId={id} />
          <DirectionCard accountId={id} />
          <AccountTrend accountId={id} />
          <ColumnTable accountId={id} />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <AccountSource accountId={id} />
          <AccountWorks accountId={id} />
        </div>
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/ideas/page.tsx
import { Bookmarks } from "@/features/ideas/bookmarks"
import { DevMaterials } from "@/features/ideas/materials"
import { IdeaBoard } from "@/features/ideas/board"
import { IdeaCapture } from "@/features/ideas/capture"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="灵感">
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <IdeaCapture />
        <IdeaBoard />
        <div className="grid items-start gap-(--gap-card) lg:grid-cols-2">
          <DevMaterials />
          <Bookmarks />
        </div>
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/tools/page.tsx
import { TOOLS } from "@/data/tools"
import { RunList } from "@/features/tools/run-list"
import { ToolGrid } from "@/features/tools/tool-grid"
import { VideoPipeline } from "@/features/tools/video-pipeline"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="工具" meta={<span className="tabular">{TOOLS.length}</span>}>
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <ToolGrid />
        <div className="grid items-start gap-(--gap-card) xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3">
            <RunList />
          </div>
          <div className="min-w-0 xl:col-span-2">
            <VideoPipeline />
          </div>
        </div>
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/data/page.tsx
import { LATEST_DAY } from "@/data/clock"
import { AccountBreakdown } from "@/features/data/breakdown"
import { DataSources } from "@/features/data/sources"
import { DataTrend } from "@/features/data/trend"
import { PullNowButton } from "@/features/data/pull-now"
import { TopWorks } from "@/features/data/top-works"
import { PageFrame } from "@/features/shell/page-frame"
import { formatDay } from "@/lib/format"

export default function Page() {
  return (
    <PageFrame
      title="数据"
      meta={<span className="hidden truncate sm:inline">{`截至 ${formatDay(LATEST_DAY)}`}</span>}
      actions={<PullNowButton />}
    >
      <div className="flex flex-col gap-(--gap-card) p-3 pb-20 lg:pb-3">
        <DataTrend />
        <div className="grid items-start gap-(--gap-card) xl:grid-cols-2">
          <div className="min-w-0">
            <AccountBreakdown />
          </div>
          <div className="min-w-0">
            <DataSources />
          </div>
        </div>
        <TopWorks />
      </div>
    </PageFrame>
  )
}
```

```tsx
// src/app/(workbench)/reports/page.tsx
import { ReportAccounts } from "@/features/reports/accounts"
import { ReportColumns } from "@/features/reports/columns"
import { ReportDigest } from "@/features/reports/digest"
import { ReportHistory } from "@/features/reports/history"
import { ReportNotes } from "@/features/reports/notes"
import { ReportWeekNav } from "@/features/reports/week-nav"
import { ReportWorks } from "@/features/reports/works"
import { PageFrame } from "@/features/shell/page-frame"

export default function Page() {
  return (
    <PageFrame title="周报" actions={<ReportWeekNav />}>
      <div className="grid gap-(--gap-card) p-3 pb-20 lg:pb-3 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-(--gap-card) xl:col-span-3">
          <ReportDigest />
          <ReportAccounts />
          <div className="grid items-start gap-(--gap-card) lg:grid-cols-2">
            <div className="min-w-0">
              <ReportWorks />
            </div>
            <div className="min-w-0">
              <ReportColumns />
            </div>
          </div>
          <ReportNotes />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap-card)">
          <ReportHistory />
        </div>
      </div>
    </PageFrame>
  )
}
```

每个区块组件**具名导出 + 默认导出双份**，自带最外层容器（`<section>`）、锚点 `id`、底色和内边距；外层的网格、间距由页面文件负责，区块不要再加外边距。

### 4.2 区块清单

总览（`design/总览.md`），**最重要的是 H1 待处理**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| H0 | 概况条（筛选栏位置） | `HomeSummaryBar` | `src/features/home/summary-bar.tsx` | — | L1 |
| H1 | 待处理 | `HomeInbox` | `src/features/home/inbox.tsx` | `inbox` | L1 |
| H3 | 本周节奏 | `HomeCadence` | `src/features/home/cadence.tsx` | `cadence` | L1 |
| H4 | 涨得快的作品 | `HomeMovers` | `src/features/home/movers.tsx` | `movers` | L1 |
| H2 | 账号 | `HomeAccounts` | `src/features/home/accounts-pulse.tsx` | `accounts` | L2 |
| H5 | 记灵感 | `HomeCapture` | `src/features/home/capture.tsx` | `capture` | L2 |
| H6 | 最近运行 | `HomeRuns` | `src/features/home/runs.tsx` | `runs` | L2 |

作品（`design/作品.md`），整页一个工作区：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| W1 | 作品工作区（视图栏、筛选栏、看板、列表、详情抽屉） | `WorksWorkspace` | `src/features/works/works-workspace.tsx`（可拆 `works-workspace-*.tsx`） | `works` | L3 |

账号（`design/账号.md`），**最重要的是 A1**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| A1 | 账号卡片 | `AccountsGrid` | `src/features/accounts/accounts-grid.tsx` | `accounts` | L4 |
| A2 | 方向对照表 | `DirectionMatrix` | `src/features/accounts/direction-matrix.tsx` | `directions` | L4 |
| A3 | 筹备中 | `PrepBoard` | `src/features/accounts/prep-board.tsx` | `prep` | L4 |

账号详情（`design/账号详情.md`），区块接收 `accountId`，**最重要的是 D2 方向档案**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| D1 | 账号头 | `AccountHeader` | `src/features/account-detail/header.tsx` | `profile` | L5 |
| D2 | 方向档案 | `DirectionCard` | `src/features/account-detail/direction.tsx` | `direction` | L5 |
| D3 | 数据走势 | `AccountTrend` | `src/features/account-detail/trend.tsx` | `trend` | L5 |
| D4 | 栏目表现 | `ColumnTable` | `src/features/account-detail/columns.tsx` | `columns` | L5 |
| D5 | 数据来源与筹备 | `AccountSource` | `src/features/account-detail/source.tsx` | `source` | L5 |
| D6 | 这个号的作品 | `AccountWorks` | `src/features/account-detail/works.tsx` | `works` | L5 |

灵感（`design/灵感.md`），**最重要的是 I2 灵感看板**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| I1 | 速记框 | `IdeaCapture` | `src/features/ideas/capture.tsx` | `capture` | L6 |
| I2 | 灵感看板 | `IdeaBoard` | `src/features/ideas/board.tsx` | `board` | L6 |
| I3 | 开发记录里的素材 | `DevMaterials` | `src/features/ideas/materials.tsx` | `materials` | L6 |
| I4 | 收藏与对标 | `Bookmarks` | `src/features/ideas/bookmarks.tsx` | `bookmarks` | L6 |

工具（`design/工具.md`），**最重要的是 T1 工具卡片**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| T1 | 工具卡片 | `ToolGrid` | `src/features/tools/tool-grid.tsx` | `tools` | L7 |
| T2 | 运行记录（含详情抽屉） | `RunList` | `src/features/tools/run-list.tsx`（可拆 `run-list-*.tsx`） | `runs` | L7 |
| T3 | 录屏成片流水线 | `VideoPipeline` | `src/features/tools/video-pipeline.tsx` | `video` | L7 |

数据（`design/数据.md`），**最重要的是 DA1 走势**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| DA0 | 现在拉一次（视图栏按钮） | `PullNowButton` | `src/features/data/pull-now.tsx` | — | L8 |
| DA1 | 走势 | `DataTrend` | `src/features/data/trend.tsx` | `trend` | L8 |
| DA2 | 分账号 | `AccountBreakdown` | `src/features/data/breakdown.tsx` | `breakdown` | L8 |
| DA3 | 作品排行 | `TopWorks` | `src/features/data/top-works.tsx` | `top` | L8 |
| DA4 | 数据来源（含手填弹窗） | `DataSources` | `src/features/data/sources.tsx`（可拆 `sources-*.tsx`） | `sources` | L8 |

周报（`design/周报.md`），**最重要的是 R1 小结**：

| # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|
| R0 | 周切换（视图栏按钮） | `ReportWeekNav` | `src/features/reports/week-nav.tsx` | — | L9 |
| R1 | 小结与建议 | `ReportDigest` | `src/features/reports/digest.tsx` | `digest` | L9 |
| R2 | 分账号 | `ReportAccounts` | `src/features/reports/accounts.tsx` | `accounts` | L9 |
| R3 | 这周发的作品 | `ReportWorks` | `src/features/reports/works.tsx` | `works` | L9 |
| R4 | 栏目表现 | `ReportColumns` | `src/features/reports/columns.tsx` | `columns` | L9 |
| R5 | 我的复盘 | `ReportNotes` | `src/features/reports/notes.tsx` | `notes` | L9 |
| R6 | 往期 | `ReportHistory` | `src/features/reports/history.tsx` | `history` | L9 |

### 4.3 共享组件签名（地基路照写，区块直接 import）

两条硬规矩：样式拼接函数（`buttonVariants` 这类）放在不带 `"use client"` 的文件里；按参数切换颜色一律用对象映射完整类名，禁止拼接类名。

**从 DeverDesk 逐字复制**（只改 import 路径；去掉 i18n 时把文字换成下面写的中文）：

| 本项目文件 | 来源（`C:\code\DeverDesk\src\…`） | 导出 | 改动 |
|---|---|---|---|
| `src/components/ui/{alert-dialog,button,command,dialog,dropdown-menu,input,input-group,kbd,label,popover,select,sheet,sonner,switch,textarea,tooltip}.tsx` | `components/ui/` 同名 | 原样 | 无 |
| `src/components/base/board.tsx` | `components/base/board.tsx` | `BoardColumn`、`CollapsedRow`、`Surface`、`CardHeading` | 无 |
| `src/components/base/empty-state.tsx` | 同名 | `EmptyState({ icon?, title, action?, tone?, className? })` | 无 |
| `src/components/base/field.tsx` | 同名 | `Field({ id, label, error?, children, className? })` | 无 |
| `src/components/base/icon-button.tsx` | 同名 | `IconButton({ label, shortcut?, size?, ...button })` | 无 |
| `src/components/base/label-chip.tsx` | 同名 | `LabelChip({ color?, icon?, children, className?, title? })`、`TierIcon` | `LabelColor` 改从 `@/data/types` 引入 |
| `src/components/base/segmented.tsx` | 同名 | `Segmented<T>({ value, options, onChange, label, className? })` | `onChange` 写成属性签名 `onChange: (value: T) => void`（方法签名会让直接传 `useState` 的 setter 时 T 被推成 string） |
| `src/components/base/status-icon.tsx` | 同名 | `StatusIcon({ glyph, tone, size?, className?, label? })` | 不再从 catalog 引类型：在本文件里定义并导出 `type StatusGlyph = "ring" \| "dashed" \| "half" \| "dot" \| "check" \| "cross" \| "alert" \| "minus"`、`type GlyphTone = "progress" \| "done" \| "risk" \| "idle" \| "neutral" \| "team"`，`TONE_COLOR` 加一项 `team: "var(--team)"` |
| `src/components/base/bars.tsx` | `features/common/bars.tsx` | `MiniBars({ values, height?, className? })`、`LabeledBars({ data, height?, className? })`、`BarDatum` | 无 |
| `src/lib/styles.ts`、`src/lib/utils.ts` | 同名 | `focusRing`、`focusRingInset`、`cn` | 无 |

**`src/components/base/delta.tsx`**（照 DeverDesk 的 `Delta` 改）：

```tsx
Delta({ value, kind = "ratio", goodWhen = "up", className }: {
  value: number | null
  kind?: "ratio" | "count"   // ratio 显示 +18%，count 显示 +128
  goodWhen?: "up" | "down"
  className?: string
})
```
文字：`ratio` 用 `formatSignedPercent(value)`，`count` 用 `formatSigned(value)`（都在 `@/lib/format`）。`null` 或非数字显示 `—`（`text-xs text-fg-2`）。持平判定：`ratio` 时 `Math.abs(value) < 0.0005`，`count` 时 `value === 0`。其余类名、箭头、颜色照 DeverDesk。

**`src/components/base/marks.tsx`**：

- `LeafMark({ size = 20, className })`：产品标识。`<span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-[5px] bg-fg", className)} style={{ width: size, height: size }}>` 里放 lucide `Leaf`，`className="text-white"`、`size={Math.round(size * 0.62)}`、`strokeWidth={2}`。
- `PlatformMark({ platform, size = 16, className })`：平台标识方块，写法和 DeverDesk 的 `ProjectMark` 一样（`rounded-[4px] font-medium text-white`，`background: var(--label-${PLATFORMS[platform].color})`，`fontSize: Math.max(9, Math.round(size * 0.6))`，`lineHeight: 1`），方块里是 `PLATFORMS[platform].glyph`，`aria-hidden`。
- `ColorDot({ color, className })`：照 DeverDesk。

**`src/components/base/account-tag.tsx`**：

```tsx
AccountTag({ account, size = "sm", showPlatform = false, className }: {
  account: Account; size?: "sm" | "md"; showPlatform?: boolean; className?: string
})
```
`<span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>` + `PlatformMark`（sm 14 / md 16）+ 名字（sm：`truncate text-xs text-fg-2`；md：`truncate text-sm text-fg`）；`showPlatform` 时名字后加 `<span className="shrink-0 text-xs text-fg-3">· {平台名}</span>`。

**`src/components/base/state-icons.tsx`**（都基于 `StatusIcon`，`label` 传状态文字供读屏）：

| 导出 | 映射 |
|---|---|
| `WorkStatusIcon({ status, size?, className? })` | idea → dashed/idle；writing → half/progress；ready → dot/progress；published → check/done |
| `RunStateIcon({ state, size?, className? })` | waiting → half/progress；running → `<LoaderCircle className="size-3.5 shrink-0 animate-spin text-fg-2" aria-label="运行中" />`；done → check/done；failed → alert/risk |
| `StepStateIcon({ state, size?, className? })` | done → check/done；running → 同上转圈；waiting → half/progress；failed → alert/risk；pending → ring/idle |
| `ToolStatusIcon({ status, size?, className? })` | ready → check/team；needs-setup → alert/progress；planned → dashed/idle |

状态文字取 `@/data/labels` 里对应的 `*_LABEL`。

**`src/components/base/pub-chip.tsx`**：`PubChip({ pub, className })` —— 一个版本的小标签，基于 `LabelChip`：
- `icon` 为 `<PlatformMark platform={平台} size={12} />`；
- 文字 = 平台名 + （形态是 answer / video / cards 时加 `PUB_FORMAT_LABEL[format]`）+ （不是 published 时加「·」和状态：pending-link →「待回填」，scheduled → `formatDayShort(plannedFor)`，draft →「草稿」）。例：`知乎`、`知乎回答`、`知乎·待回填`、`小红书卡片·10/10`、`B站视频·草稿`；
- `color`：pending-link 时 `"amber"`，其余不传；
- `title` 为完整说明：`${平台名} · ${PUB_FORMAT_LABEL} · ${PUB_STATE_LABEL}`。

**`src/components/base/progress-meter.tsx`**：`ProgressMeter({ value, className, title })`，value 0～1（超出截断）：
`<span title={title} aria-hidden className={cn("relative inline-block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-pressed", className)}><span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: \`${pct}%\` }} /></span>`。

**`src/components/base/source-badge.tsx`**：`SourceBadge({ source, className })`，source 是 `DataSource`：
`<span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs", className)}>` + 6px 圆点（`size-1.5 shrink-0 rounded-full`，ok → `var(--team)`，failed → `var(--risk)`，never → `var(--idle)`）+ 文字（`truncate`）：
- ok：`${DATA_MODE_LABEL[mode]} · ${formatRelative(lastPullAt)}`，`text-fg-2`
- failed：`拉取失败 · ${formatRelative(lastPullAt)}`，`text-bad`
- never：`还没有数据`，`text-fg-2`

**`src/components/charts/metric-chart-card.tsx`**（`"use client"`，照 DeverDesk 的 `InsightChart` 改写）：

```tsx
MetricChartCard({ scope, className }: { scope: string; className?: string })   // scope 为 "all" 或账号编号
```
- 状态：`metric: MetricId` 默认 `"followers"`；`range: RangeId` 默认 `"12w"`；`compare: boolean` 默认 `true`。
- 四个页签（顺序固定）：followers、reads、interactions、posts。页签文字：scope 为 `"all"` 时用 `METRIC_LABEL`（粉丝、阅读、互动、发布）；是账号时 followers 用 `account.audienceLabel`、reads 用 `account.readsLabel`，其余同上。
- 数据：`metricSeries(scope, metric, range)`（`@/lib/metrics`），四个页签各算一次。
- 外层：`<section aria-label="数据走势" className={cn("overflow-hidden rounded-lg border border-line bg-card shadow-sm", className)}>`。
- 页签行：`grid grid-cols-2 sm:grid-cols-4`，每个页签照 DeverDesk 的 `MetricTab`：上面一行左边指标名、右边 `<Delta value={change} />`，下面一行大数字 `text-xl font-medium text-fg tabular`（`formatCount(value)`）。页签按钮加 `data-metric-tab={metric}`，大数字 span 加 `data-metric-value={metric}`。
- 页签下面一行（`flex h-7 items-center gap-2 px-3 pt-2 text-xs text-fg-2`）：左边说明「近 12 周，按周」/「近 4 周，按天」；右边 `ml-auto` 依次放 `Segmented`（选项 `4w` 近 4 周、`12w` 近 12 周，label「时间范围」，根元素加 `data-range-switch`）和对比开关（`Switch` + 文字「对比上一期」，`id="compare-${scope}"`，`Label htmlFor` 关联）。
- 图：`h-[200px] sm:h-[232px]`，recharts 写法照 DeverDesk 的 `TrendChart`：posts 用柱状图（`Bar`，最后一根 `fillOpacity={0.55}`），其余用面积图（`Area` + 渐变填充，渐变 id 写成 `metric-fill-${scope}` 避免同页重复）；compare 打开时画上一期虚线；`CartesianGrid vertical={false}`；纵轴最小 0；所有动画关掉。悬停提示照 `TrendTooltip`：标题、「本期」值、对比打开时「上一期」值，数字用 `formatCount`。
- 空数据（所有点都是 0）：图区换成 `<EmptyState icon={ChartLine} title="还没有数据" />`，页签照常显示 0。

### 4.4 外壳（地基路照 DeverDesk 改写，放在 `src/features/shell/`）

从 DeverDesk 的 `src/features/shell/` 复制并删减：去掉 i18n（文字直接写中文，见下）、数据 store、同步、登录、AI、计时、版本切换、备份、语言菜单、显示设置。

| 文件 | 来源 | 要点 |
|---|---|---|
| `shell-frame.tsx` | 同名 | 结构不变；侧栏折叠状态改读 `useUi`（4.5）；去掉 `ShortcutsDialog` 之外的依赖 |
| `shell-skeleton.tsx` | 同名 | 原样 |
| `shell-context.tsx` | 同名 | 原样（`CrumbProvider`、`useShellCrumb`） |
| `window-bar.tsx` | 同名 | 搜索框文字「搜索作品、账号、工具」；快捷键提示照旧（⌘K / Ctrl K）；按钮的 label：「打开导航」「收起侧栏」「展开侧栏」「后退」「前进」「搜索」「快捷键」 |
| `page-frame.tsx` | 同名 | `PageFrame`、`FilterBar`、`ViewTab` 签名不变；视图页签的 `aria-label` 写「视图」 |
| `sidebar-parts.tsx` | 同名 | 原样 |
| `mobile-nav.tsx` | 同名 | 抽屉标题「导航」 |
| `nav.ts` | 改写 | 见下 |
| `workbench-sidebar.tsx` | 改写 | 见下 |
| `workbench-shell.tsx` | 改写 | 见下 |
| `command-palette.tsx` | 参照 `workbench-command.tsx` 改写 | 见下 |
| `notifications.tsx` | 参照 `workbench-notifications.tsx` 改写 | 见下 |
| `user-menu.tsx` | 参照同名改写 | 见下 |
| `quick-capture.tsx` | 参照同名改写 | 见下 |
| `shortcuts.tsx` | 参照同名改写 | 见下 |

**nav.ts**：

```ts
export const PAGES = [
  { key: "home", label: "总览", path: "/", icon: LayoutDashboard, goKey: "h" },
  { key: "works", label: "作品", path: "/works/", icon: FileText, goKey: "w" },
  { key: "accounts", label: "账号", path: "/accounts/", icon: UsersRound, goKey: "a" },
  { key: "ideas", label: "灵感", path: "/ideas/", icon: Lightbulb, goKey: "i" },
  { key: "tools", label: "工具", path: "/tools/", icon: Workflow, goKey: "t" },
  { key: "data", label: "数据", path: "/data/", icon: ChartColumn, goKey: "d" },
  { key: "reports", label: "周报", path: "/reports/", icon: NotebookPen, goKey: "r" },
] as const
```
视图（侧栏第三组）：`waiting`「等我处理」→ `/tools/?state=waiting`，数量 = `RUNS` 里 state 为 waiting 的个数（4）；`pending`「待发」→ `/works/?view=pending`，数量 = 「有待发版本的作品」个数：作品状态为 ready，或者有任何一个版本是 scheduled / pending-link（4 个：Jev、AI 做的页面、Cloudflare Tunnel 加 Access、SaaS 后台）；`issues`「数据异常」→ `/data/#sources`，数量 = `INBOX` 里 kind 为 data 或 manual 的个数（3）。
当前高亮：先把 `pathname` 去掉末尾斜杠（根路径保持 `/`）；`/accounts/<id>` → 高亮侧栏里那个账号行；地址和某个视图完全一致（路径 + 参数）→ 高亮视图；否则高亮路径前缀匹配的页面（`/` 只在完全相等时匹配）。

**workbench-sidebar.tsx**（照 DeverDesk 侧栏的三段结构）：
1. 顶部 `h-10` 一行：品牌菜单按钮（`LeafMark size={18}` + 文字「LeafPress」`text-sm font-medium`，下拉里两项：「记灵感」（`SquarePen`，快捷键 N，打开速记）、「快捷键」（`Keyboard`，快捷键 ?））；右边 `IconButton` label「记灵感」快捷键 N，图标 `SquarePen`，点了打开速记。
2. 页面：`PAGES` 逐个 `NavRow`；「作品」行的 count 显示作品总数 49，「灵感」行显示收件箱数（`useIdeas` 里 status 为 inbox 的个数，初始 4），其余不显示。
3. 分组标题「账号」：`ACCOUNTS` 逐个 `NavRow`，`href` 为 `/accounts/<id>/`，`icon` 为 `<PlatformMark platform={…} size={16} />`，`label` 为账号名，`count` 为 `formatCount(summaryOf(id).followers)`；名字相同的账号（一叶之桐有三个）靠平台标识区分。
4. 分组标题「视图」：三个视图 `NavRow`，图标依次 `<StatusIcon glyph="half" tone="progress" />`、`<StatusIcon glyph="dot" tone="progress" />`、`<StatusIcon glyph="alert" tone="risk" />`。

**workbench-shell.tsx**：用 `ShellFrame`，`crumb` 为 `{ icon: <LeafMark size={16} />, label: "自媒体" }`；`windowBar` 的 `notifications` 放 `<Notifications />`，`userMenu` 放 `<UserMenu />`；`overlays` 放 `<CommandPalette />`、`<QuickCapture />`、手机右下角的速记按钮（`lg:hidden fixed right-4 bottom-4 z-40`，`Button size="icon-lg"` 圆角 `rounded-full shadow-md`，图标 `SquarePen`，`aria-label="记灵感"`）；`shortcuts` 见下。

**command-palette.tsx**（cmdk，照 DeverDesk 的命令面板外观）：输入框占位「搜索作品、账号、工具…」；分组依次：「页面」（7 个 PAGES，跳转）、「账号」（5 个，跳详情，显示 `PlatformMark`）、「工具」（10 个 TOOLS，跳 `/tools/#tools`）、「作品」（全部 `WORK_ROWS`，按输入过滤，跳 `/works/?open=<id>`，右侧小字显示平台标签）、「操作」（「记一条灵感」打开速记）。没有结果时显示「没有找到」。打开方式：窗口栏搜索框、⌘K / Ctrl+K。

**notifications.tsx**：窗口栏的铃铛 `IconButton`（label「提醒」，图标 `Bell`）；`INBOX` 里有 tone 为 risk 的项时，铃铛右上角画一个 6px 的 `var(--risk)` 圆点。点开 `Popover`（宽 `w-80`）：标题行「提醒」+ 右侧数量；列表是 `INBOX` 里 tone 不为 idle 的项（10 条），每行 `flex gap-2 px-3 py-2`：左边状态图形（risk → alert/risk，progress → half/progress），中间两行（`title` 用 `text-sm`、`detail` 用 `text-xs text-fg-2 truncate`），右边 `formatRelative(at)`（`text-xs text-fg-2`，排期类不显示时间）；整行是链接（external 的用 `<a target="_blank">`）。底部一行链接「全部待处理」→ `/#inbox`。

**user-menu.tsx**：头像按钮（`size-6 rounded-full bg-column text-xs font-medium` 显示「叶」，`aria-label="我的"`）；下拉菜单三项：「连接 AI 助手」（`Bot`，打开一个 `Dialog`：标题「连接 AI 助手」，正文三行说明「在 Claude Code 里说一句话就能记灵感、查数据、登记发布」，一个只读输入框显示 `http://localhost:3210/mcp`，旁边 `IconButton` 复制（label「复制地址」，复制后 toast「已复制」））、「快捷键」（打开快捷键弹窗）、分隔线、「打开博客」（站外链接 `https://blog.chaosyn.com/`）。

**quick-capture.tsx**：`Dialog`，标题「记灵感」；`Textarea`（`id="quick-capture-text"`，占位「一句话就行」，3 行）；下面一行两个 `Select`：账号（选项「不挂账号」+ 5 个账号，默认「不挂账号」）、栏目（选了账号后出现该账号的栏目，默认第一个）；底部按钮「取消」（outline）和「记下」（default，文字为空时禁用）。提交：调用 `useIdeas().add({ text, accountId, columnId, source: "quick" })`，关闭弹窗，toast「记下了」，清空输入。⌘/Ctrl + Enter 也能提交。打开状态读写 `useUi().captureOpen`。

**shortcuts.tsx**：全局快捷键 —— ⌘K / Ctrl+K 打开命令面板；`N` 打开速记；`[` 折叠侧栏；`?` 打开快捷键弹窗；先按 `G` 再按 `PAGES` 的 goKey 跳页。在输入框、文本框里不触发（照 DeverDesk 的判断）。快捷键弹窗标题「快捷键」，列出以上几组。

### 4.5 共享状态（`src/state/`，地基路写）

```ts
// src/state/ui.ts
export const useUi = create<{
  commandOpen: boolean; setCommandOpen(open: boolean): void
  captureOpen: boolean; setCaptureOpen(open: boolean): void
  shortcutsOpen: boolean; setShortcutsOpen(open: boolean): void
  mobileNavOpen: boolean; setMobileNavOpen(open: boolean): void
  sidebarCollapsed: boolean; setSidebarCollapsed(collapsed: boolean): void
}>(…)

// src/state/ideas.ts —— 灵感列表，初始值是 IDEAS；总览的速记、灵感页、侧栏计数共用
export const useIdeas = create<{
  ideas: Idea[]
  /** 新灵感放在最前面，编号 `new-1`、`new-2`……，createdAt 用 DEMO_NOW，status 为 inbox */
  add(input: { text: string; accountId?: string; columnId?: string; source: IdeaSource; sourceDetail?: string }): Idea
  move(id: string, status: IdeaStatus): void
  /** 转成作品：status 改 converted，workId 填 `w-new-<编号>` */
  convert(id: string): void
}>(…)

// src/state/report-week.ts —— 周报正在看哪一周，默认 LAST_WEEK
export const useReportWeek = create<{ week: DayKey; setWeek(week: DayKey): void }>(…)
```

不持久化（刷新复原）。

---

## 5. 各区块详细规格

按页拆在 `design/` 下，每个区块写七项：外层、元素、数据、交互、状态、响应式、文案。

- [design/总览.md](design/总览.md) —— H0～H6
- [design/作品.md](design/作品.md) —— W1
- [design/账号.md](design/账号.md) —— A1～A3
- [design/账号详情.md](design/账号详情.md) —— D1～D6
- [design/灵感.md](design/灵感.md) —— I1～I4
- [design/工具.md](design/工具.md) —— T1～T3
- [design/数据.md](design/数据.md) —— DA0～DA4
- [design/周报.md](design/周报.md) —— R0～R6

---

## 6. 文案原则

- 全中文，短句。数字一律具体，从数据和格式化函数来。
- 删掉后不影响理解和操作的文字就不加；区块只放标题，不配副标题、说明句。
- 不写无意义状态文案（「一切正常」「服务在线」）；不写开发说明和版本规划（「V1 暂不支持」「即将上线」「原型」「演示」）。
- 按钮写动作：「回填链接」「去校对」「记下」「转成作品」；链接写去向：「打开主页」「看全部作品」。
- 空态一句话说现状，最多给一个动作：「这周还没有发布」「没有符合条件的作品」。
- 原型里做不到的操作（比如真的去拉数据），按钮照常可点，用 toast 给出合理的结果文字（各页规格写明），不提示「做不到」。

---

## 7. 质量门禁

```bash
cd C:\code\LeafPress\web
pnpm test          # 只测 src/data、src/lib，主控已写
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint，零警告
pnpm build         # next build，静态导出到 out/
pnpm format:check  # prettier（主控最后统一格式化，区块路不用管）
```

构建后确认这些文件都在：`out/index.html`、`out/works/index.html`、`out/accounts/index.html`、`out/accounts/zhihu-yiye/index.html`、`out/accounts/blog-chaosyn/index.html`、`out/accounts/wechat-acg/index.html`、`out/accounts/bili-yiye/index.html`、`out/accounts/xhs-yiye/index.html`、`out/ideas/index.html`、`out/tools/index.html`、`out/data/index.html`、`out/reports/index.html`。

自查：用到状态、副作用、事件处理的文件第一行 `"use client"`；禁止 `any`、`@ts-ignore`；禁止未使用的 import；**禁止在组件里调用 `new Date()`、`Date.now()`、`Math.random()`**（时间一律从 `@/data/clock` 取）；组件里不写死业务数字；移动端不横向溢出；SVG 图有 `role="img"` 和 `aria-label`，纯装饰的 `aria-hidden`；图标按钮有 `aria-label`；可交互元素有焦点样式。

---

## 8. 文件写入边界与分路表（并发协作铁律）

- 公共文件（地基路写，**区块路一律不准碰**）：`src/app/**`、`src/components/**`、`src/features/shell/**`、`src/state/**`、`src/styles/**`、`src/lib/**`、`src/data/**`、`package.json`、`pnpm-lock.yaml`、`next.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`postcss.config.mjs`、`vitest.config.mts`、`.prettierrc.json`、`DESIGN.md`、`design/**`。
- 每路只写分给自己的文件；要拆子组件，只能放在本页目录、以自己的区块文件名开头（例如 `run-list-sheet.tsx`）。
- 只能 import：`react`、`next/link`、`next/navigation`、`lucide-react`（白名单内）、`sonner`、`cn`、`@/components/**`、`@/features/shell/page-frame`、`@/state/**`、`@/lib/**`、`@/data/**`，以及本路自己的文件。**不 import 别的区块文件。**

| 路 | 负责的文件 |
|---|---|
| L0 地基 | 上面全部公共文件，以及所有区块的占位文件 |
| L1 总览 A | `src/features/home/{summary-bar,inbox,cadence,movers}.tsx` |
| L2 总览 B | `src/features/home/{accounts-pulse,capture,runs}.tsx` |
| L3 作品 | `src/features/works/works-workspace*.tsx` |
| L4 账号 | `src/features/accounts/*.tsx` |
| L5 账号详情 | `src/features/account-detail/*.tsx` |
| L6 灵感 | `src/features/ideas/*.tsx` |
| L7 工具 | `src/features/tools/*.tsx` |
| L8 数据 | `src/features/data/*.tsx` |
| L9 周报 | `src/features/reports/*.tsx` |

---

## 9. 哪些是编的

| 项 | 状态 |
|---|---|
| 博客 39 篇中文文章的标题、slug、发布日期、标签、字数、图片数、代码块数 | **真实**，来自 `C:\code\yeton-blog\content\posts\zh` |
| 博客链接 `https://blog.chaosyn.com/posts/<slug>/` | **真实**格式（核对过一篇能打开） |
| 博客访问量、评论数、订阅数 | **编的**，按发布时间长短生成 |
| 知乎账号「一叶之桐」、四个栏目、文风规矩和禁用词 | **真实**，来自知乎写作 skill |
| 《ChatGPT 网页版接入自建MCP》已发到知乎 | **真实**（用户确认）；发布日期和数据是**编的** |
| 其余知乎版本、回答挂的问题、所有知乎数据、关注者数 | **编的**；知乎链接都是 `demo-` 开头的假地址 |
| 公众号「ACG萌图宅」、栏目「二次元美图壁纸 第 N 期」、每期 8 张、只出草稿 | **真实**，来自 publish-pixiv 的配置 |
| 公众号最后一期在 7 月 28 日 | **真实**，按本机 published.db 的记录；期号 182、183 是**推的** |
| 公众号用户数、阅读、审核队列 46 张、第 184 期 3/8 已通过 | **编的** |
| B站、小红书两个筹备中的号、筹备清单、粉丝数 | **编的** |
| 开发记录素材（LeafPress、DeverDesk 的进度和提交） | **真实**，摘自进度流水和 git log |
| 灵感、收藏笔记、工具运行记录、周复盘笔记 | **编的** |
| 工具清单里的知乎写作、博客复盘、插画审图、插画出草稿 | **真实**存在的 skill；其余工具是 LeafPress 要做的 |
| 演示时刻 2026-10-08 09:30 | 固定值，所有「今天」「几天前」从它算 |

一致性由单测保证（`src/data/data.test.ts`）：每个版本每天的阅读加起来等于累计阅读；作品状态和版本状态对得上；账号栏目占比加起来等于 1。

---

## 附录 数据接口索引

数据多且带计算，已由主控写成代码并配了 32 条单测（`pnpm test`），**一个字都不要改**。

| 文件 | 导出 | 用途 |
|---|---|---|
| `src/data/types.ts` | 全部类型 | `Account`、`Work`、`Publication`、`Idea`、`Tool`、`ToolRun` 等 |
| `src/data/clock.ts` | `DEMO_NOW`、`TODAY`、`LATEST_DAY`、`THIS_WEEK`、`LAST_WEEK`、`addDays`、`diffDays`、`weekdayIndex`、`weekStartOf`、`daysBetween`、`dayOf`、`daysAgo` | 演示时刻和日期运算 |
| `src/data/accounts.ts` | `PLATFORMS`、`ACCOUNTS`、`accountById`、`columnOf` | 平台和 5 个账号 |
| `src/data/works.ts` | `WORKS`（49）、`PUBLICATIONS`（64）、`workById`、`publicationsOf` | 作品和版本 |
| `src/data/ideas.ts` | `IDEAS`（16）、`DEV_MATERIALS`（6）、`BOOKMARKS`（5） | 灵感、开发素材、收藏 |
| `src/data/tools.ts` | `TOOLS`（10）、`RUNS`（11，新的在前）、`WEEKLY_NOTES`、`WECHAT_REVIEW_QUEUE`、`WECHAT_REVIEW_URL` | 工具和运行记录 |
| `src/data/labels.ts` | `WORK_STATUS_LABEL`、`WORK_STATUS_ORDER`、`PUB_STATE_LABEL`、`PUB_FORMAT_LABEL`、`STAGE_LABEL`、`DATA_MODE_LABEL`、`IDEA_STATUS_LABEL`、`IDEA_STATUS_ORDER`、`IDEA_SOURCE_LABEL`、`MATERIAL_KIND_LABEL`、`TOOL_STATUS_LABEL`、`RUN_STATE_LABEL`、`STEP_KIND_LABEL`、`METRIC_LABEL` | 界面上的状态文字 |
| `src/data/series.ts` | `ACCOUNT_DAILY`、`pubDaily`、`WECHAT_LAST_ISSUE` | 每日数据（区块一般不直接用，走 metrics） |
| `src/lib/format.ts` | `formatCount`、`formatSigned`、`formatPercent`、`formatSignedPercent`、`formatDay`、`formatDayShort`、`weekdayLabel`、`formatWeekRange`、`formatTime`、`formatRelative`、`formatDayRelative`、`formatDuration` | 显示格式 |
| `src/lib/metrics.ts` | `ACCOUNT_SUMMARIES`、`summaryOf`、`metricSeries`、`columnRows`、`weekReport`、`REPORT_WEEKS`、`weekCadence`、`INBOX`、`topPublications`、`rankedPub`、`WORK_ROWS`、`workRow`、`toolStats`、`toolName`、`metricText`、`shortTitle`、`accountLabel`、`platformName`、`followersOn`、`sumFlow` | 页面要的统计 |

交互检查要核对的数字见各页规格末尾，全部来自 `src/lib/metrics.test.ts`。
