# LeafPress 自媒体工作台 —— 站点层规格（唯一事实来源）

> 所有实现会话动手前先读完本文件，再读 `design/` 下属于自己那一页的规格。本文件和 `design/*.md` 是契约，**实现会话不得修改**。
> 规格分两层：本文件定全站的东西，**每路必读全文**；`design/<页面>.md` 写逐区块规格，**每路只读自己那一页**。
> 这是第二版：第一版只能看不能动，这一版围绕「灵感 → 作品（任务）→ 工作流 → 要你动手的步骤 → 归档」把动作做出来。

---

## 0. 定位与参照

一个人运营多个自媒体账号的工作台，四件核心的事：**多账号管理、灵感获取、作品管理、任务管理**。任务管理就在作品页里做：**一个作品就是一条任务**。

核心流程（全站都围着它转）：

```
 ① 灵感（随手记、AI 批量跑、定时「跑灵感」）
        │ 转作品：选几个平台就生成几个作品（一转多）
        ▼
 ② 作品「待实现」（AI 的待做，按先后排队）──── 每个作品只对应一个平台、一个账号（一比一）
        │ 让 AI 做（页面按钮，或者 agent 读任务文件夹接手）
        ▼
 ③ 作品「进行中」：按自动配好的工作流一步一步走
        │ 走到要你动手的步骤（去知乎投递、确认大纲、录屏……）
        ▼
 ④ 作品「等你处理」：页面上写着「要你做的事」，下面一个反馈框
        │ 你做完，在反馈框里写「发布了，链接是 https://…」
        ▼
 ⑤ 回到「待实现」最前面，等 AI 继续 → AI 读反馈、归档链接 → 「已完成」
```

- **工作流自动配**：创建作品时按「平台 + 来源」自动挑（博客 → 博客写稿；知乎且来源是博客作品 → 博客转知乎；知乎其余 → 知乎写作；小红书 → 转小红书卡片；B站 → 录屏成片），作品里可以换成同平台别的工作流。
- **任务文件夹**：每个作品一个文件夹 `~/.leafpress/tasks/<作品编号>/`，放中间产物、要你做的事、你的反馈、记录。任何 agent 读这个文件夹就能接着干。页面上的「复制给 AI」复制的就是这份说明。
- **已发的博客文章也是作品**（39 篇，从博客仓库导入）。在它上面点「转作品」选知乎，就生成一个来源是这篇博客的知乎作品，工作流自动配成「博客转知乎」。
- **定时工作流**一直在跑：每天 06:00 拉作品数据、每天 08:00 跑灵感、每周一 08:00 出周报，结果在工作流页、数据页、灵感页都看得到。

目标观感：**和 DeverDesk 一模一样的安静工作台：窄导航、宽工作区、小字号、浅灰到白的三级底色，颜色只用来识别平台和状态，数字一眼可读。**

| 参照 | 抄什么 |
|---|---|
| DeverDesk（`C:\code\DeverDesk`，用户自己的项目） | 整套外壳、令牌、shadcn 组件；**任务看板**（`src/features/tasks/tasks-board.tsx`：列宽 288px 横向滚动、列里白卡、拖到别的列改状态、「再显示 N 个」）；**任务卡片**（`src/features/common/task-card.tsx`：三层信息、悬停出菜单、整卡可点）；任务详情抽屉的属性行写法 |
| Linear（凭记忆） | 作品详情：标题直接可改、属性做成左标签右控件的两列行、记录按时间倒序；列表行 36px 整行悬停变浅灰 |
| GitHub Projects / Trello（凭记忆） | 拖卡片换列、列内拖动排先后、拖动时画一条插入线 |
| 知乎创作中心「内容分析」（凭记忆） | 已发作品的数据格：阅读、赞同、收藏、评论 |

不抄：DeverDesk 的计时、收支、例行、多语言、登录、同步；看板卡片上的大色块、进度环、头像堆。

### 0.1 页面清单

| 页面 | 路由 | 用户来干什么 | 首屏核心动作 | 区块下限 | 分路 |
|---|---|---|---|---|---|
| 作品（首页） | `/` | 看 AI 和自己各有哪些活，处理等自己的事，编辑作品 | 看板四列 + 卡片点开详情；「等你处理」卡片里直接提交反馈 | 1 个工作区（看板 / 列表 / 详情抽屉） | L1 看板、L2 详情 |
| 灵感 | `/ideas/` | 记灵感、改灵感、挑值得写的、转成作品 | 速记框 + 三列灵感看板（可拖、可点开编辑、可转作品） | 3 | L3 |
| 账号 | `/accounts/` | 看在做哪些号、方向、各号手上有多少活 | 账号卡片 | 3 | L5 |
| 账号详情 | `/accounts/[id]/` | 看一个号的方向档案、数据和作品 | 方向档案（可编辑） | 6 | L5 |
| 工作流 | `/workflows/` | 看有哪些发布工作流、怎么自动配、定时工作流跑得怎样 | 工作流卡片 | 4 | L4 |
| 数据 | `/data/` | 看走势、排行、数据来源 | 主图卡切换指标 | 5 | L6 |
| 周报 | `/reports/` | 看一周小结、写复盘 | 周切换 + 小结 | 7 | L6 |

---

## 1. 技术栈（已锁定）

| 项 | 值 |
|---|---|
| 框架 | Next.js 16.3.6（App Router），`output: "export"`，`trailingSlash: true`，`images.unoptimized: true` |
| 语言 | TypeScript 5.9，`strict: true` + `noUnusedLocals` + `noUnusedParameters`（不要改 `tsconfig.json`） |
| 样式 | Tailwind CSS 4.3 + `tw-animate-css` + `shadcn/tailwind.css` |
| 组件 | shadcn（radix-ui 1.6.7）、cmdk、sonner；类名合并用 `cn` 包（`import { cn } from "cn"`） |
| 状态 | zustand 5；作品和灵感用 `persist` 存在浏览器 localStorage（见 4.5） |
| 拖动 | 浏览器自带的拖放（`draggable` + `onDragStart` / `onDrop`），共享封装在 `@/components/base/board-dnd`；**不引入拖放库** |
| 图标 | lucide-react 1.48.0，只用下面白名单 |
| 图表 | recharts 3.8.0（只有共享的 `MetricChartCard` 用它） |
| 单测 | vitest 5（只测 `src/data`、`src/lib` 和区块目录里的纯函数文件） |
| 包管理 | pnpm（依赖已装好，**不要再装**） |

**不引入**：任何别的依赖（拖放库、日期库、动画库、图表库、图标库、UI 框架都不要）。`next/image` 不用。

**站内链接**一律 `next/link` 的 `Link`，地址带尾斜杠：`/ideas/`、`/accounts/zhihu-yiye/`；首页带参数写成 `/?open=z-jev`、`/?status=waiting`。**站外链接**用 `<a href target="_blank" rel="noreferrer">`。
**地址栏参数**一律用 `useSearchParams` 读、`useRouter().replace` 改（不 push，返回键不会一格一格退）。

可用图标白名单（lucide-react 1.48.0 里都有，只用这些）：
`LayoutDashboard FileText Files UsersRound UserRound Lightbulb Workflow ChartColumn ChartLine NotebookPen CalendarRange CalendarDays Search Bell Plus SquarePen ChevronRight ChevronLeft ChevronDown ChevronUp ArrowUpRight ArrowDownRight ArrowLeft ArrowRight ArrowUpDown ExternalLink Link Link2 Copy Check CheckCheck X Clock Timer Play Pause RefreshCw RotateCcw CircleAlert TriangleAlert Info Sparkles Bot Video Image Images Film Mic Captions Scissors Clapperboard Newspaper PenLine Pencil BookOpen Bookmark Inbox Archive Tag Hash Target Flag Eye Heart ThumbsUp MessageSquare MessageCircle Star Share2 TrendingUp TrendingDown Download Upload Filter ListFilter SlidersHorizontal LayoutGrid List Kanban Menu PanelLeft Keyboard Settings Database CloudDownload Server Terminal Command Leaf Calendar CircleDot Circle Ellipsis Trash2 Send Repeat History FolderGit2 GitCommitHorizontal Globe Rss Feather Layers WandSparkles Hourglass CircleCheck CircleX LoaderCircle Users Mail Quote ScrollText ClipboardCheck ClipboardList ListChecks Gauge Activity Zap Hand Tv MonitorPlay Smartphone Folder FolderOpen GripVertical MoveRight`。
需要别的形状就手写内联 SVG。

---

## 2. 设计令牌

**令牌和 DeverDesk 完全一致**：`src/styles/tokens.css`、`src/app/globals.css` 是从 DeverDesk 逐字复制的，数值以那两个文件为准。各区块要用的工具类：

| 类名 | 值 | 用途 |
|---|---|---|
| `bg-window` | #f2f2f3 | 窗口底（窗口栏、侧栏） |
| `bg-panel` | #fbfbfb | 工作区面板 |
| `bg-column` | #f4f4f5 | 看板列、分组底 |
| `bg-card` | #ffffff | 卡片、表格、输入框 |
| `bg-raised` | #f7f7f8 | 表头、灰底提示框、未选中的页签 |
| `text-fg` | #1c1c20 | 正文、标题（对比度 16:1） |
| `text-fg-2` | #62626b | 次要文字、说明、表头（对比度 5.9:1） |
| `text-fg-3` | #8f8f98 | **只给图标、占位文字、禁用态**，不做正文 |
| `border-line` / `border-line-2` / `border-line-3` | #ebebee / #e2e2e6 / #d0d0d6 | 卡片边 / 输入框边 / 悬停加深 |
| `bg-hover` / `bg-pressed` / `bg-selected` | 半透明黑 4.5% / 8% / 6.5% | 悬停、按下、选中 |
| `text-good` / `text-bad` / `text-warn` | #1f8a53 / #cf3035 / #8a6100 | 涨跌和警示**文字**，只用在 12～13px 小字上 |
| `bg-ink` / `text-ink` | #2b2b31 | 图表主色、进度条、勾选框选中 |
| `var(--team)` #2f9e62、`var(--progress)` #e5a50a、`var(--done)` #6e56cf、`var(--risk)` #e5484d、`var(--idle)` #a1a1a9 | | 状态图形和小色点，**只做图形，不做文字** |
| `var(--label-*)`（red orange amber green teal blue indigo violet pink gray） | | 平台标识方块、栏目色点、标签色点 |

平台颜色取 `PLATFORMS[platform].color`：博客 green、知乎 blue、B站 pink、小红书 red。
**「等你处理」的强调**只用两样：卡片边框 `border-progress/40`（悬停 `hover:border-progress/70`），和 `text-warn` 的小字。不加黄色底块。
**组件里禁止写十六进制色值**；按数据取色写 `style={{ background: \`var(--label-${color})\` }}`。

字号只有三档：`text-xs`（12/16）、`text-sm`（13/17，默认）、`text-xl`（20/24，只给大数字）。**不准用 text-base、text-lg、text-2xl 及以上**。字重只用 400 和 `font-medium`。所有数字加 `tabular`。等宽用 `font-mono`（编号、路径、文件名）。

间距：工作区内容 `p-3`，手机 `pb-20 lg:pb-3`；卡片间 `gap-(--gap-card)`（8px）；列表卡内边距 `px-3 py-2.5`；列表行 `h-8`，表格行 `h-9`，看板列标题行 `h-9`；圆角控件 `rounded-md`、卡片 `rounded-lg`、弹窗 `rounded-xl`；阴影卡片 `shadow-sm`、浮层 `shadow-md`。可点元素加 `focusRing`，整行可点的用 `focusRingInset`（`@/lib/styles`）。
断点用 Tailwind 默认；侧栏 `lg` 以下收进抽屉。**验收看两档：桌面 1440×900、手机 390×844。**

全局样式只有：`focus-ring`、`scroll-thin`、`tabular`、`no-scrollbar`（来自 `shadcn/tailwind.css`）。不追加。

---

## 3. 动效纪律

几乎不动：悬停、按下只变底色和边框（`transition-colors duration-(--dur-fast)`）；弹窗、抽屉、下拉用 shadcn 自带动画；**AI 正在做的作品用 `LoaderCircle animate-spin`（`Spinner` 组件），这是唯一的循环动画**。拖动中的卡片 `opacity-50`。不准入场动画、数字滚动、悬停放大、图表动画（recharts 一律 `isAnimationActive={false}`）。

---

## 4. 文件结构与共享组件

```
web/
├── DESIGN.md、design/          规格（不准改）
├── src/app/                     路由（主控已写）
├── src/components/ui/           shadcn 组件
├── src/components/base/         基础组件（主控已写）
├── src/components/work/         作品相关的共享组件：ConvertDialog（主控已写）
├── src/components/charts/       MetricChartCard
├── src/features/shell/          外壳（主控已写）
├── src/features/<页面>/         各页区块（区块路写）
├── src/state/                   zustand 共享状态（主控已写）
├── src/lib/                     format、metrics、report、board、work-engine（主控已写，带单测）
└── src/data/                    演示数据（主控已写）
```

### 4.1 路由（主控已写好页面文件，区块路不要改）

| 路由 | 页面文件里放的区块 |
|---|---|
| `/` | `WorksPage`（`src/features/works/works-page.tsx`，整页一个工作区，自己返回 `PageFrame`） |
| `/ideas/` | `PageFrame title="灵感" meta={<IdeasMeta />}`；上面一行两格 `IdeaCapture`、`IdeaHarvest`（`lg:grid-cols-2`），下面 `IdeaBoard` |
| `/accounts/` | `AccountsGrid`、`DirectionMatrix`、`PrepBoard`（同第一版） |
| `/accounts/[id]/` | `AccountHeader`、`DirectionCard`、`AccountTrend`、`ColumnTable`（左两格宽）；`AccountSource`、`AccountWorks`（右一格），同第一版 |
| `/workflows/` | `PageFrame title="工作流"`；`WorkflowCards`；下面一行两格 `ScheduledRuns`、`PickRules`（`xl:grid-cols-2`）；最下 `ToolTable` |
| `/data/` | 同第一版：`DataTrend`、`AccountBreakdown` + `DataSources`、`TopWorks`；视图栏 `PullNowButton` |
| `/reports/` | 同第一版：`ReportDigest`、`ReportAccounts`、`ReportWorks` + `ReportColumns`、`ReportNotes`、右栏 `ReportHistory`；视图栏 `ReportWeekNav` |

每个区块组件**具名导出 + 默认导出双份**，自带最外层容器（`<section>`）、锚点 `id`；外层网格、间距由页面文件负责，区块不加外边距。区块组件不接收参数，例外：账号详情的区块接收 `accountId: string`；`WorkSheet` 见 `design/作品.md`。

### 4.2 区块清单

| 页 | # | 区块 | 组件 | 文件 | 锚点 | 路 |
|---|---|---|---|---|---|---|
| 作品 | W1 | 作品工作区：视图栏、筛选栏、看板、列表、卡片菜单 | `WorksPage` | `src/features/works/works-page.tsx`（可拆 `works-*.tsx`） | `works` | L1 |
| 作品 | W2 | 作品详情抽屉（可编辑、等你处理面板、步骤、任务文件夹、记录） | `WorkSheet` | `src/features/works/work-sheet.tsx`（可拆 `work-sheet-*.tsx`） | — | L2 |
| 灵感 | I1 | 速记 | `IdeaCapture` | `src/features/ideas/capture.tsx` | `capture` | L3 |
| 灵感 | I2 | 跑灵感 | `IdeaHarvest` | `src/features/ideas/harvest.tsx` | `harvest` | L3 |
| 灵感 | I3 | 灵感看板（含卡片、编辑抽屉、转作品） | `IdeaBoard` | `src/features/ideas/board.tsx`（可拆 `board-*.tsx`） | `board` | L3 |
| 工作流 | F1 | 发布工作流 | `WorkflowCards` | `src/features/workflows/cards.tsx`（可拆 `cards-*.tsx`） | `workflows` | L4 |
| 工作流 | F2 | 定时工作流 | `ScheduledRuns` | `src/features/workflows/scheduled.tsx` | `scheduled` | L4 |
| 工作流 | F3 | 自动配规则 | `PickRules` | `src/features/workflows/pick-rules.tsx` | `rules` | L4 |
| 工作流 | F4 | 工具 | `ToolTable` | `src/features/workflows/tools.tsx` | `tools` | L4 |
| 账号 / 账号详情 | A1～A3、D1～D6 | 见 `design/账号.md`、`design/账号详情.md` | 同第一版 | `src/features/accounts/`、`src/features/account-detail/` | 同第一版 | L5 |
| 数据 / 周报 | DA0～DA4、R0～R6 | 见 `design/数据.md`、`design/周报.md` | 同第一版 | `src/features/data/`、`src/features/reports/` | 同第一版 | L6 |

### 4.3 共享组件（主控已写好，直接 import，不要改）

**从 DeverDesk 来的**（签名同第一版）：`@/components/ui/*`（alert-dialog、button、command、dialog、dropdown-menu、input、input-group、kbd、label、popover、select、sheet、sonner、switch、textarea、tooltip）；`BoardColumn`、`CollapsedRow`、`Surface`、`CardHeading`（`@/components/base/board`）；`EmptyState({ icon?, title, action?, tone?, className? })`；`Field({ id, label, error?, children, className? })`；`IconButton({ label, shortcut?, size?, ...button })`（size 可选 `icon-xs`、`icon-sm`（默认）、`icon`）；`LabelChip({ color?, icon?, children, className?, title? })`；`Segmented<T>({ value, options, onChange, label, className? })`；`StatusIcon({ glyph, tone, size?, className?, label? })`；`MiniBars`、`LabeledBars`；`Delta({ value, kind?, goodWhen?, className? })`；`LeafMark`、`PlatformMark({ platform, size?, className? })`、`ColorDot({ color })`；`AccountTag({ account, size?, showPlatform?, className? })`；`ProgressMeter({ value, className?, title? })`；`SourceBadge({ source })`；`MetricChartCard({ scope })`。

**这一版新增或改过的**：

| 组件 | 文件 | 用法 |
|---|---|---|
| `WorkStatusIcon({ status, size?, className? })` | `@/components/base/state-icons` | 待实现 ring/idle、进行中 half/progress、等你处理 dot/progress、已完成 check/done |
| `StepStateIcon({ state, size?, className? })` | 同上 | 步骤：done 对勾、running 转圈、waiting 黄点、pending 空心圈；`state` 用 `stepState(work, index)` 算 |
| `Spinner({ className?, label? })` | 同上 | AI 正在做（`running` 里有这个作品）时用 |
| `WorkflowStatusIcon({ status })` | 同上 | 工作流可用 / 需配置 |
| `RunResultIcon({ result })` | 同上 | 定时工作流最近一次成功 / 失败 |
| `WorkChip({ work, className? })` | `@/components/base/work-chip` | 作品小标签（平台标识 + 平台名 + 状态图形），本身是链接到 `/?open=<编号>`，带 `data-work-chip`，点击不冒泡 |
| `ConfirmDialog({ open, onOpenChange, title, description?, confirmLabel, destructive?, onConfirm })` | `@/components/base/confirm-dialog` | 删除作品、删除灵感前问一句；确认按钮带 `data-confirm` |
| `WORK_DRAG`、`IDEA_DRAG`、`startCardDrag(event, type, id)`、`endCardDrag()`、`useBoardDrop(type, onDrop) → { over, beforeId, dropProps }`、`DropLine` | `@/components/base/board-dnd` | 拖动卡片。卡片 `draggable` + `onDragStart={(e) => startCardDrag(e, WORK_DRAG, id)}` + `onDragEnd={endCardDrag}` + 外层 `data-drag-id={id}`；列外层展开 `dropProps`；`over` 为真时在 `beforeId` 那张卡前面（为空则在最后）画 `<DropLine />`，列加 `outline-2 outline-offset-[-2px] outline-dashed outline-line-3` |
| `ConvertDialog({ source, onClose, onDone? })` | `@/components/work/convert-dialog` | 转作品 / 新建作品弹窗。`source` 为 `ConvertSource \| null`（null 关闭）：`{ kind: "idea", idea }`、`{ kind: "work", work }`、`{ kind: "new", title: "" }`。弹窗里勾账号（每行写着会自动配的工作流）、写要求，提交后生成作品、toast「转成了 N 个作品，放进待实现」带「打开」按钮。账号行 `data-convert-account=<编号>`、提交按钮 `data-convert-submit` |

不再有 `PubChip`（第一版的「版本」概念取消了：一个作品就是一个平台上的一份内容）。

### 4.4 外壳（主控已写好）

- 侧栏页面：作品 `/`（数字 = 作品总数，跟着页面变）、灵感（收件箱条数）、账号、工作流、数据、周报。账号分组：4 个账号，数字是粉丝数。视图分组：「等你处理」→ `/?status=waiting`、「待实现」→ `/?status=todo`、「数据异常」→ `/data/#sources`，数字实时。
- 窗口栏搜索（⌘K）：操作（记一条灵感、新建作品、让 AI 挑一个做）、最近的作品（输入后搜全部作品）、灵感、页面、账号、工作流。选作品跳 `/?open=<编号>`，选灵感跳 `/ideas/?open=<编号>`。
- 铃铛：`notices(works)`：数据拉取失败、等你处理的作品、该手填的数据。
- 头像菜单：交给 AI（任务文件夹位置 + 在 agent 里怎么说）、快捷键、恢复初始数据（清掉浏览器里存的作品和灵感）、打开博客。
- 快捷键：N 记灵感、C 新建作品（打开 `useUi().newWorkOpen` 对应的 `ConvertDialog`）、G 再按 W/I/A/F/D/R 跳页、⌘K 搜索、`[` 折叠侧栏、`?` 快捷键。
- `StoreHydration`：页面挂载后才读浏览器里存的作品和灵感（静态页面先按初始数据渲染）。

### 4.5 共享状态（`src/state/`，主控已写好）

```ts
// src/state/works.ts —— 作品（也是任务）。改动存在 localStorage（键 leafpress:works）
useWorks: {
  works: Work[]                 // 初始 64 个
  running: string[]             // AI 正在做（页面上「让 AI 做」后还在走步骤）的作品编号
  update(id, patch: { title?, brief?, columnId?, workflowId?, question?, url? }): void
  drop(id, status: WorkStatus, beforeId: string | null): ActionResult   // 拖动：挪列 + 排位置；挪到 doing 等于让 AI 做；已完成的挪不出来
  create(source: ConvertSource, accountIds: string[], brief: string): Work[]   // 一般走 convertToWorks
  runAi(id): ActionResult       // 让 AI 做：每 0.9 秒走一步，停在要你动手的步骤或做完；工作流要配置时返回 { ok: false, reason }
  feedback(id, text): void      // 提交反馈：回到待实现最前面，等 AI 继续
  remove(id): void
}
type ActionResult = { ok: true } | { ok: false; reason: string }   // 失败时 toast(reason)

// src/state/ideas.ts —— 灵感。存在 localStorage（键 leafpress:ideas）
useIdeas: {
  ideas: Idea[]                 // 初始 17 条
  add({ text, detail?, accountId?, source, sourceDetail? }): Idea     // 放在收件箱最前面
  update(id, patch: { text?, detail?, accountId? }): void
  drop(id, status: "inbox" | "promising", beforeId: string | null): void   // 已转作品的不能拖
  remove(id): void
  harvest(): Idea[]             // 跑灵感，一般走 runSchedule
}

// src/state/actions.ts —— 要同时改几份数据的动作
convertToWorks(source, accountIds, brief): Work[]   // 生成作品；来源是灵感时灵感挪到「已转作品」并记下作品编号
runSchedule(id): string                             // 定时工作流现在跑一次，返回 toast 文字；跑灵感会真的往收件箱放 2 条
resetAll(): void

// src/state/schedules.ts —— 定时工作流最近一次运行（不存）
useSchedules: { runs: Record<id, { lastRunAt, lastResult, lastNote }> }

// src/state/ui.ts —— 界面开关
useUi: { commandOpen, captureOpen, newWorkOpen, shortcutsOpen, mobileNavOpen, sidebarCollapsed + 各自的 set }

// src/state/report-week.ts —— 周报看哪一周，默认 LAST_WEEK
```

读状态一律用选择器：`useWorks((state) => state.works)`。从数组派生的东西用 `useMemo`，不要在选择器里 `filter` 出新数组（会无限重渲染）。

### 4.6 推进规则和看板计算（`src/lib/`，主控已写好、带单测，直接用）

| 导出 | 文件 | 用途 |
|---|---|---|
| `workflowOf(work)`、`platformOf(work)` | `work-engine` | 作品的工作流、平台 |
| `stepState(work, index)`、`currentStep(work)`、`progressText(work)`、`waitingLabel(work)` | 同上 | 步骤状态；当前步骤；「第 6/7 步 · 你去知乎投递」/「7/7 步」；等你处理时那一句（要你动手的步骤名，手动挪过来的写「你来看一下」） |
| `taskFiles(work)` | 同上 | 任务文件夹里现在有哪些文件 |
| `taskContext(work, source?)` | 同上 | 复制给 AI 的任务说明（markdown） |
| `pickNext(works)` | 同上 | AI 挑下一个：待实现里排最前、工作流可用的 |
| `extractUrl(text)`、`GENERIC_ASK` | 同上 | 从反馈里取链接；手动挪到等你处理时的通用一句 |
| `defaultBrief(source)`、`workflowForConvert(source, accountId)` | 同上 | 转作品弹窗用 |
| `taskFolder(id)` | `@/data/works` | `~/.leafpress/tasks/<编号>` |
| `sortColumn(works, status)` | `@/lib/board` | 一列里的先后：待实现按排队顺序；进行中、等你处理按最近变动；已完成按发布日期新的在前 |
| `filterWorks(works, { platform, query })`、`EMPTY_FILTER`、`countBy(works, status)` | 同上 | 筛选、计数 |
| `workflowUsage(works, workflowId)`、`derivedFrom(works, workId)` | 同上 | 工作流在用 / 已完成个数；由某作品转出去的作品 |
| `sortIdeas(ideas, status)` | 同上 | 灵感一列里的先后 |
| `notices(works)` | 同上 | 提醒 |
| `summaryOf`、`ACCOUNT_SUMMARIES`、`metricSeries`、`columnRows`、`topWorks`、`rankedWork`、`publishedWorks`、`metricText`、`shortTitle`、`accountLabel`、`platformName` | `@/lib/metrics` | 数据快照上的统计（账号、数据页） |
| `weekReport`、`REPORT_WEEKS` | `@/lib/report` | 周报 |

**数据快照和页面状态分开**：粉丝、阅读、排行、周报读的是 `src/data`（相当于每天定时拉回来的数据），不跟着页面上的改动变；看板、详情、侧栏数字、提醒读 `useWorks` / `useIdeas`。页面上刚完成的作品，数据格显示「还没有数据」。

---

## 5. 各区块详细规格

- [design/作品.md](design/作品.md) —— W1、W2
- [design/灵感.md](design/灵感.md) —— I1～I3
- [design/工作流.md](design/工作流.md) —— F1～F4
- [design/账号.md](design/账号.md)、[design/账号详情.md](design/账号详情.md) —— 第一版规格 + 本轮改动
- [design/数据.md](design/数据.md)、[design/周报.md](design/周报.md) —— 第一版规格 + 本轮改动

---

## 6. 文案原则

- 全中文，短句，数字具体。删掉不影响理解和操作的字就不加；区块只放标题，不配副标题。
- 不写无意义状态文案（「一切正常」）；**不写开发说明和版本规划**（「原型」「演示」「V1」「即将上线」「暂不支持」）。
- 按钮写动作：「让 AI 做」「提交反馈」「转作品」「复制给 AI」「记下」；链接写去向。
- 状态说法全站统一：作品 **待实现 / 进行中 / 等你处理 / 已完成**；灵感 **收件箱 / 值得写 / 已转作品**；步骤种类 **AI / 自动 / 你来**（取 `@/data/labels`）。
- 空态一句话说现状，最多一个动作：「没有等你处理的作品」「这一列是空的」。
- 做不到的真实操作（真的去拉数据），按钮照常可点，用 toast 给出合理结果，不提示「做不到」。

---

## 7. 质量门禁

```bash
cd C:\code\LeafPress\web
pnpm typecheck     # 区块路只跑这个
pnpm lint          # 零警告（主控统一跑）
pnpm test
pnpm build         # 静态导出到 out/
pnpm format:check  # 主控最后统一格式化
```

构建后这些文件都在：`out/index.html`、`out/ideas/index.html`、`out/accounts/index.html`、`out/accounts/{zhihu-yiye,blog-chaosyn,bili-yiye,xhs-yiye}/index.html`、`out/workflows/index.html`、`out/data/index.html`、`out/reports/index.html`。

自查：用到状态、副作用、事件处理的文件第一行 `"use client"`；禁止 `any`、`@ts-ignore`、未使用的 import；**禁止在组件里调用 `new Date()`、`Date.now()`、`Math.random()`**（时间从 `@/data/clock` 取，作品时间由 store 给）；不在 effect 里 setState（eslint 的 `react-hooks/set-state-in-effect` 会报；地址栏参数变了要跟着改状态时，用「渲染时对比上一次的参数」写法：`const [prev, setPrev] = useState(params); if (params !== prev) { setPrev(params); …setXxx }`）；手机不横向溢出；图标按钮有 `aria-label`；可交互元素有焦点样式；长标题 `truncate` 或 `line-clamp-*`。

---

## 8. 文件写入边界与分路表

- 公共文件（主控写，**区块路一律不准碰**）：`src/app/**`、`src/components/**`、`src/features/shell/**`、`src/state/**`、`src/styles/**`、`src/lib/**`、`src/data/**`、配置文件、`DESIGN.md`、`design/**`。
- 每路只写分给自己的文件；拆子组件只能放在本页目录、以自己的文件名开头。
- 只能 import：`react`、`next/link`、`next/navigation`、`lucide-react`（白名单内）、`sonner`、`cn`、`@/components/**`、`@/features/shell/page-frame`、`@/state/**`、`@/lib/**`、`@/data/**`，以及本路自己的文件。**不 import 别的路的文件**（L1 引用 L2 的 `WorkSheet` 是唯一例外，签名见 `design/作品.md`）。
- 公共文件有错或缺东西：不要自己改，在回报的「拿不准的点」里写清楚。

| 路 | 负责的文件 |
|---|---|
| L1 作品看板 | `src/features/works/works-*.tsx`（含 `works-page.tsx`） |
| L2 作品详情 | `src/features/works/work-sheet*.tsx` |
| L3 灵感 | `src/features/ideas/*`（`meta.tsx` 已写好，不用改） |
| L4 工作流 | `src/features/workflows/*` |
| L5 账号 | `src/features/accounts/*`、`src/features/account-detail/*` |
| L6 数据与周报 | `src/features/data/*`、`src/features/reports/*` |

---

## 9. 哪些是编的

| 项 | 状态 |
|---|---|
| 博客 39 篇中文文章的标题、slug、发布日期、标签、字数、图片数、代码块数、本地路径 | **真实**，来自 `C:\code\yeton-blog\content\posts\zh` |
| 博客链接 `https://blog.chaosyn.com/posts/<slug>/` | **真实**格式 |
| 博客访问量、评论数、订阅数 | **编的** |
| 知乎账号「一叶之桐」、四个栏目、文风规矩和禁用词 | **真实**，来自知乎写作 skill |
| 《ChatGPT 网页版接入自建MCP》已发到知乎 | **真实**；发布日期和数据是**编的** |
| 其余知乎作品、回答挂的问题、知乎数据、关注者数；知乎链接 `demo-` 开头 | **编的** |
| B站、小红书两个筹备中的号 | **编的** |
| 灵感、周复盘笔记、定时工作流运行记录 | **编的**，素材出处（LeafPress、DeverDesk 的进度和提交）是真的 |
| 六个发布工作流的步骤 | 按用户已有的 skill 和工具**设计的**；知乎写作、博客复盘、知乎官方发布 skill 真实存在 |
| 演示时刻 2026-10-08 09:30（周四） | 固定值；页面上的新动作从它往后每次推一分钟 |

---

## 附录 数据接口索引（主控已写，带单测，一个字都不要改）

| 文件 | 导出 |
|---|---|
| `src/data/types.ts` | `Account`、`Platform`、`Work`、`WorkStatus`、`WorkSource`、`WorkLog`、`Workflow`、`WorkflowStep`、`StepKind`、`ScheduledWorkflow`、`Tool`、`Idea`、`IdeaStatus`、`IdeaSource`、`DailyPoint`、`WeeklyNote` 等 |
| `src/data/clock.ts` | `DEMO_NOW`、`TODAY`、`LATEST_DAY`、`THIS_WEEK`、`LAST_WEEK`、`addDays`、`addMinutes`、`diffDays`、`weekdayIndex`、`weekStartOf`、`daysBetween`、`dayOf`、`daysAgo` |
| `src/data/accounts.ts` | `PLATFORMS`（含每个平台有哪些互动数据）、`ACCOUNTS`（4 个）、`accountById`、`columnOf` |
| `src/data/works.ts` | `WORKS`（64：待实现 6、进行中 1、等你处理 4、已完成 53）、`workById`、`taskFolder` |
| `src/data/ideas.ts` | `IDEAS`（17：收件箱 7、值得写 5、已转作品 5）、`HARVEST_POOL` |
| `src/data/workflows.ts` | `WORKFLOWS`（6）、`SCHEDULED`（3）、`TOOLS`（12）、`workflowById`、`pickWorkflow`、`workflowsFor` |
| `src/data/notes.ts` | `WEEKLY_NOTES` |
| `src/data/labels.ts` | `WORK_STATUS_LABEL`、`WORK_STATUS_ORDER`、`IDEA_STATUS_LABEL`、`IDEA_STATUS_ORDER`、`IDEA_SOURCE_LABEL`、`STEP_KIND_LABEL`、`WORKFLOW_STATUS_LABEL`、`STAGE_LABEL`、`DATA_MODE_LABEL`、`METRIC_LABEL` |
| `src/data/series.ts` | `ACCOUNT_DAILY`、`workDaily` |
| `src/lib/format.ts` | `formatCount`、`formatSigned`、`formatPercent`、`formatSignedPercent`、`formatDay`、`formatDayShort`、`weekdayLabel`、`formatWeekRange`、`formatTime`、`formatRelative`、`formatDayRelative`、`formatDuration` |
| `src/lib/platform.ts` | `copyText(text): Promise<boolean>`、`useIsMac`、`isTypingTarget` |

交互检查要核对的数字见各页规格末尾，全部来自 `src/lib/*.test.ts`、`src/data/data.test.ts`。
