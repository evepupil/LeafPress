import { LATEST_DAY, diffDays } from "./clock"
import { seededRandom } from "./rng"
import type { DayKey, PubFormat, PubState, Publication, Work } from "./types"

/**
 * 作品与各平台版本。
 * 博客的 39 篇中文文章是真实的（标题、日期、标签、字数、图片和代码块数照博客仓库），访问量是生成的；
 * 其余平台的版本、数据和非博客作品都是编的，清单见 web/DESIGN.md 第 9 章。
 */

/** [slug, 标题, 发布日期, 标签, 原稿来源, 字数, 图片, 代码块] —— 照 C:\code\yeton-blog\content\posts\zh 抄 */
const BLOG_POSTS: [string, string, DayKey, string, "notion" | "repo", number, number, number][] = [
  [
    "design-extraction-saas-dashboard",
    "只凭一份设计提炼做 SaaS 后台：把规则锁进主题，把看板骨架搬到新业务",
    "2026-09-29",
    "AI/前端",
    "repo",
    6337,
    2,
    2,
  ],
  [
    "edge-address-bar-copy-empty",
    "Edge 地址栏全选复制后粘贴为空：开启 URL 复制和粘贴格式开关",
    "2026-09-26",
    "postmortem",
    "repo",
    1836,
    1,
    1,
  ],
  [
    "hackintosh-hardware-compatibility-2026-09",
    "截至 2026 年 9 月，黑苹果还能用哪些硬件",
    "2026-09-25",
    "黑苹果/macOS",
    "repo",
    11500,
    0,
    0,
  ],
  [
    "ai-frontend-info-design-first",
    "AI 做的页面像模板货又空心：先做信息设计，再把风格写成数字规格",
    "2026-09-23",
    "postmortem/AI/前端",
    "repo",
    7790,
    7,
    0,
  ],
  [
    "reasoning-content-must-be-passed-back",
    "DeepSeek 思考模式下多轮工具调用中断报 400：回传 reasoning_content",
    "2026-09-22",
    "postmortem/AI",
    "repo",
    2661,
    0,
    3,
  ],
  [
    "jev-classification-fallback-option",
    "Jev 把「下午三点开会」判成清朝诗词：分类选项必须留一个兜底项",
    "2026-09-21",
    "postmortem/AI",
    "repo",
    3904,
    0,
    1,
  ],
  [
    "cloudflare-r2-oci-registry-large-layer-upload",
    "Cloudflare R2 自建 OCI 镜像仓库上传大模型层失败：从 413、500 到 1102 改成内部分段复制",
    "2026-09-20",
    "postmortem/Cloudflare",
    "repo",
    3814,
    0,
    5,
  ],
  [
    "go-postgresql-nanosecond-replay-conflict",
    "Go 纳秒时间写入 PostgreSQL 后产生重放冲突：统一截断到微秒",
    "2026-09-19",
    "postmortem",
    "repo",
    3546,
    0,
    7,
  ],
  [
    "tolower-byte-offset-index-out-of-range",
    "转小写会改变字节长度，一条请求就让 Go 网关进程退出：改成只折叠英文字母",
    "2026-09-19",
    "postmortem/Go",
    "repo",
    3955,
    0,
    6,
  ],
  [
    "cross-machine-clock-skew-job-stuck-99",
    "客户端与服务器相差 0.65 秒导致任务卡在 99%：按时钟域拆分时间",
    "2026-09-15",
    "postmortem",
    "repo",
    4012,
    0,
    6,
  ],
  [
    "modelscope-amd-comfyui-minimax-h3",
    "魔搭赠送的 AMD GPU 跑通 ComfyUI 与 MiniMax H3：绕开无 Docker 与 HuggingFace 被墙",
    "2026-09-14",
    "postmortem/AI",
    "repo",
    3275,
    0,
    0,
  ],
  [
    "minimax-h3-rtx-5090-speed-cost",
    "MiniMax H3 在 RTX 5090 上的速度与成本：5 秒视频约 46–60 秒",
    "2026-09-07",
    "postmortem/AI",
    "repo",
    5045,
    0,
    1,
  ],
  [
    "comfyui-custom-op-pytorch-upgrade",
    "升级 PyTorch 解决 ComfyUI 的 torch.library.custom_op 启动错误",
    "2026-09-06",
    "postmortem/AI",
    "repo",
    4466,
    0,
    9,
  ],
  [
    "minimax-h3-turbo-audio-dual-clock-sampler",
    "MiniMax H3 Turbo 音频失真的根因与双时钟采样器修复",
    "2026-09-05",
    "postmortem/AI",
    "repo",
    3385,
    0,
    7,
  ],
  [
    "minimax-h3-high-resolution-upscaling",
    "MiniMax H3 高分辨率放大：音视频潜空间拆分与二次采样",
    "2026-09-04",
    "postmortem/AI",
    "repo",
    4596,
    0,
    6,
  ],
  ["modelscope-gpu-reverse-ssh-tunnel", "魔搭 GPU 实例无公网入口时的反向 SSH 隧道接入", "2026-09-04", "postmortem/SSH", "repo", 4539, 0, 6],
  ["notion-3be4342e", "关于一些天才为什么是天才的思考", "2026-08-17", "乱七八糟", "notion", 1891, 0, 0],
  ["cloudflare-tunnel-ssh-3bd4342e", "Cloudflare Tunnel 实现ssh穿透", "2026-08-15", "Cloudflare", "notion", 2925, 2, 3],
  [
    "saas-nextdevtpl-2-x-saas-3ae4342e",
    "开源SaaS网站模板NextDevTpl 2.x：把 SaaS 模板变成可组合的项目生成器",
    "2026-07-31",
    "开源项目",
    "notion",
    2501,
    0,
    3,
  ],
  ["chatgpt-mcp-3a94342e", "ChatGPT 网页版接入自建MCP", "2026-07-26", "Cloudflare/AI", "notion", 5426, 5, 12],
  ["prompt-subagent-ai-36c4342e", "从 Prompt 到 Subagent：AI 工程化学习路线", "2026-05-26", "AI", "notion", 3645, 0, 0],
  ["cloudflare-workers-ai-3594342e", "Cloudflare Workers AI 免费额度值多少钱？", "2026-05-07", "Cloudflare", "notion", 2436, 0, 0],
  ["claude-code-chatgpt-34a4342e", "claude code里面使用chatgpt的模型教程", "2026-04-22", "好玩/AI", "notion", 495, 2, 0],
  [
    "cloudflare-worker-反代网站为什么有的网站能用有的网站一上来就是403",
    "Cloudflare Worker 反代网站为什么有的网站能用，有的网站一上来就是 403？",
    "2026-04-05",
    "Cloudflare/serverless/疑难杂症",
    "repo",
    6036,
    0,
    1,
  ],
  [
    "anki-ai-audio-wash-player-32c4342e",
    "我做了一个把 Anki 听力和 AI 阅读串起来的小插件：Audio Wash Player",
    "2026-03-23",
    "开源项目",
    "notion",
    2429,
    4,
    0,
  ],
  ["notion-fuwari-3264342e", "开源自用的博客系统notion-fuwari", "2026-03-17", "好玩", "notion", 2131, 0, 0],
  ["ai-agent-3114342e", "AI Agent 深度学习指南", "2026-02-24", "AI", "notion", 16330, 0, 27],
  [
    "nextdevtpl-next-js-saas-30b4342e",
    "NextDevTpl：一个面向独立开发者的 Next.js 全栈 SaaS 模板",
    "2026-02-18",
    "开源项目",
    "notion",
    1393,
    1,
    1,
  ],
  [
    "cloudflare-ai-gateway-3024342e",
    "Cloudflare AI Gateway 自定义供应商配置与踩坑记录",
    "2026-02-09",
    "Cloudflare/AI",
    "notion",
    2211,
    2,
    4,
  ],
  ["cloudflare-tunnel-2f54342e", "Cloudflare Tunnel 实现国内未备案服务器通过域名访问", "2026-01-27", "Cloudflare", "notion", 1381, 5, 0],
  [
    "cloudflare-worker-ip-403-2e94342e",
    "Cloudflare Worker 反代服务器的IP出现403的解决办法",
    "2026-01-15",
    "Cloudflare",
    "notion",
    939,
    0,
    0,
  ],
  [
    "cloudflare-ai-search-autorag-ai-2e74342e",
    "Cloudflare AI Search（AutoRAG）接入实战，个人博客的知识库AI助手",
    "2026-01-13",
    "serverless/Cloudflare/RAG/AI",
    "notion",
    2770,
    4,
    3,
  ],
  ["chromium-1187-playwright-2b54342e", "chromium-1187对应版本的playwright版本", "2025-11-24", "疑难杂症", "notion", 441, 1, 3],
  ["cloud-flare-2b34342e", "Cloud Flare配置优选节点教程", "2025-11-23", "Cloudflare", "notion", 557, 2, 0],
  [
    "vercel-cf-worker-2b34342e",
    "Vercel项目国内访问慢？CF worker反代+优选节点，无备案零成本极速访问",
    "2025-11-23",
    "Cloudflare",
    "notion",
    1079,
    5,
    0,
  ],
  ["cloudflare-worker-2ad4342e", "Cloudflare Worker反向代理网站教程", "2025-11-17", "Cloudflare/好玩/serverless", "notion", 4792, 1, 11],
  ["web-ai-markdown-2ae4342e", "Web 端实现 AI 内容流式传输与实时 Markdown 渲染", "2025-11-17", "前端", "notion", 3912, 0, 9],
  ["pixiv-api-2a94342e", "Pixiv爬虫常用API的文档汇总", "2025-10-08", "爬虫/pixiv/好玩", "notion", 5062, 1, 16],
  ["pixiv-2a94342e", "Pixiv爬虫/下载/代理，无需服务器即可一键部署！", "2025-10-07", "爬虫/serverless/pixiv/好玩", "notion", 8405, 1, 11],
]

/** 博客栏目按标签归：问题复盘 > Cloudflare > AI > 开源项目 > 随笔 */
function blogColumn(tags: string[]): string {
  if (tags.includes("postmortem")) return "postmortem"
  if (tags.includes("Cloudflare")) return "cloudflare"
  if (tags.includes("AI")) return "ai"
  if (tags.includes("开源项目")) return "oss"
  return "misc"
}

/** 博客访问量是生成的：越老的文章累计越多，个别文章额外加权 */
const BLOG_BOOST: Record<string, number> = {
  "chatgpt-mcp-3a94342e": 2.4,
  "ai-agent-3114342e": 2.2,
  "cloudflare-worker-2ad4342e": 1.8,
  "pixiv-2a94342e": 1.6,
  "ai-frontend-info-design-first": 1.5,
}

function blogTotals(slug: string, published: DayKey) {
  const random = seededRandom(`blog-reads:${slug}`)
  const age = diffDays(LATEST_DAY, published) + 1
  const ageFactor = Math.min(1, 0.35 + age / 120)
  const reads = Math.round((600 + random() * 3000) * ageFactor * (BLOG_BOOST[slug] ?? 1))
  const comments = Math.round(reads * (0.002 + random() * 0.004))
  return { reads, likes: 0, comments, collects: 0 }
}

const blogWorks: Work[] = BLOG_POSTS.map(([slug, title, date, tags, origin, words, images, codeBlocks]) => {
  const tagList = tags.split("/")
  return {
    id: slug,
    title,
    status: "published",
    accountId: "blog-chaosyn",
    columnId: blogColumn(tagList),
    tags: tagList,
    createdAt: date,
    updatedAt: date,
    sourceRef: `zh/${slug}`,
    origin,
    words,
    images,
    codeBlocks,
  }
})

const blogPubs: Publication[] = BLOG_POSTS.map(([slug, , date, tags]) => ({
  id: `p-blog-${slug}`,
  workId: slug,
  accountId: "blog-chaosyn",
  columnId: blogColumn(tags.split("/")),
  format: "article",
  state: "published",
  url: `https://blog.chaosyn.com/posts/${slug}/`,
  publishedAt: date,
  totals: blogTotals(slug, date),
}))

/** 不在博客里的作品：知乎原创、公众号、筹备中的稿子 */
const otherWorks: Work[] = [
  {
    id: "w-claude-md",
    title: "CLAUDE.md 是什么，怎么写才会被执行",
    status: "published",
    accountId: "zhihu-yiye",
    columnId: "ai-eng",
    tags: ["AI", "Claude Code"],
    createdAt: "2026-09-08",
    updatedAt: "2026-09-10",
    origin: "zhihu-writing",
    words: 2180,
    images: 0,
    codeBlocks: 2,
    runId: "run-11",
  },
  {
    id: "w-tests-rule",
    title: "AI 写代码的项目，哪些代码必须写测试、哪些禁止写",
    status: "published",
    accountId: "zhihu-yiye",
    columnId: "ai-eng",
    tags: ["AI", "测试"],
    createdAt: "2026-09-16",
    updatedAt: "2026-09-18",
    origin: "zhihu-writing",
    words: 1960,
    images: 0,
    codeBlocks: 0,
  },
  {
    id: "w-leafpress-intro",
    title: "LeafPress：把一份原稿变成多个平台的版本",
    status: "writing",
    accountId: "zhihu-yiye",
    columnId: "ai-eng",
    tags: ["AI", "自媒体"],
    createdAt: "2026-10-06",
    updatedAt: "2026-10-07",
    origin: "zhihu-writing",
    note: "大纲待确认：五节，第三节讲「先登记发布意图，再调平台」。",
    runId: "run-05",
  },
  {
    id: "w-fleet-truncation",
    title: "派便宜模型写代码：一次输出 3.3 万字就截断，任务书要写明分步落盘",
    status: "writing",
    accountId: "zhihu-yiye",
    columnId: "ai-eng",
    tags: ["AI", "AI 工程化"],
    createdAt: "2026-10-05",
    updatedAt: "2026-10-06",
    origin: "idea",
    words: 820,
    note: "素材来自 LeafPress 进度流水 10 月 5 日检查点 3。",
  },
  {
    id: "w-hourly-rate",
    title: "一人公司怎么算每个副业的时薪",
    status: "idea",
    accountId: "zhihu-yiye",
    columnId: "econ",
    tags: ["经济管理", "独立开发"],
    createdAt: "2026-10-03",
    updatedAt: "2026-10-03",
    origin: "idea",
  },
  {
    id: "w-vacuum-into",
    title: "SQLite 升级前备份：为什么用 VACUUM INTO 而不是复制文件",
    status: "idea",
    accountId: "zhihu-yiye",
    columnId: "cs",
    tags: ["SQLite", "计算机"],
    createdAt: "2026-10-06",
    updatedAt: "2026-10-06",
    origin: "idea",
  },
  {
    id: "w-acg-183",
    title: "二次元美图壁纸 第183期",
    status: "published",
    accountId: "wechat-acg",
    columnId: "wallpaper",
    tags: ["壁纸"],
    createdAt: "2026-07-28",
    updatedAt: "2026-07-28",
    origin: "pipeline",
    images: 8,
  },
  {
    id: "w-acg-182",
    title: "二次元美图壁纸 第182期",
    status: "published",
    accountId: "wechat-acg",
    columnId: "wallpaper",
    tags: ["壁纸"],
    createdAt: "2026-07-28",
    updatedAt: "2026-07-28",
    origin: "pipeline",
    images: 8,
  },
  {
    id: "w-acg-184",
    title: "二次元美图壁纸 第184期",
    status: "writing",
    accountId: "wechat-acg",
    columnId: "wallpaper",
    tags: ["壁纸"],
    createdAt: "2026-07-29",
    updatedAt: "2026-10-08",
    origin: "pipeline",
    note: "审核队列 46 张待审，已通过 3/8。",
  },
  {
    id: "w-tunnel-access",
    title: "用 Cloudflare Tunnel 加 Access，把本机服务安全地开放给手机",
    status: "ready",
    accountId: "blog-chaosyn",
    columnId: "cloudflare",
    tags: ["Cloudflare"],
    createdAt: "2026-10-04",
    updatedAt: "2026-10-07",
    sourceRef: "zh/cloudflare-tunnel-access",
    origin: "repo",
    words: 3120,
    images: 4,
    codeBlocks: 5,
  },
]

type Totals = NonNullable<Publication["totals"]>

function pub(
  id: string,
  workId: string,
  accountId: string,
  columnId: string,
  format: PubFormat,
  state: PubState,
  extra: { publishedAt?: DayKey; plannedFor?: DayKey; question?: string; totals?: Totals } = {},
): Publication {
  const url =
    state === "published"
      ? accountId === "zhihu-yiye"
        ? format === "answer"
          ? `https://www.zhihu.com/question/demo/answer/${id}`
          : `https://zhuanlan.zhihu.com/p/demo-${id}`
        : accountId === "wechat-acg"
          ? `https://mp.weixin.qq.com/s/demo-${id}`
          : undefined
      : undefined
  return { id, workId, accountId, columnId, format, state, ...(url ? { url } : {}), ...extra }
}

const t = (reads: number, likes: number, collects: number, comments: number): Totals => ({ reads, likes, collects, comments })

const otherPubs: Publication[] = [
  pub("zh-chatgpt-mcp", "chatgpt-mcp-3a94342e", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-07-29",
    totals: t(15_620, 702, 1_380, 88),
  }),
  pub("zh-prompt-subagent", "prompt-subagent-ai-36c4342e", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-05-28",
    totals: t(21_904, 1_105, 2_310, 96),
  }),
  pub("zh-prompt-subagent-answer", "prompt-subagent-ai-36c4342e", "zhihu-yiye", "ai-eng", "answer", "published", {
    publishedAt: "2026-06-03",
    question: "如何系统地学习 AI 工程化？",
    totals: t(9_870, 512, 846, 41),
  }),
  pub("zh-ai-agent", "ai-agent-3114342e", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-03-01",
    totals: t(12_450, 640, 1_512, 58),
  }),
  pub("zh-workers-ai", "cloudflare-workers-ai-3594342e", "zhihu-yiye", "cs", "article", "published", {
    publishedAt: "2026-05-09",
    totals: t(4_310, 166, 248, 22),
  }),
  pub("zh-nextdevtpl", "saas-nextdevtpl-2-x-saas-3ae4342e", "zhihu-yiye", "cs", "article", "published", {
    publishedAt: "2026-08-02",
    totals: t(2_870, 118, 205, 19),
  }),
  pub("zh-tunnel-ssh", "cloudflare-tunnel-ssh-3bd4342e", "zhihu-yiye", "cs", "article", "published", {
    publishedAt: "2026-08-17",
    totals: t(5_480, 231, 512, 30),
  }),
  pub("bili-tunnel-ssh", "cloudflare-tunnel-ssh-3bd4342e", "bili-yiye", "tutorial", "video", "draft"),
  pub("zh-minimax-5090", "minimax-h3-rtx-5090-speed-cost", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-09-08",
    totals: t(4_905, 187, 260, 35),
  }),
  pub("zh-claude-md", "w-claude-md", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-09-10",
    totals: t(18_330, 966, 1_702, 121),
  }),
  pub("zh-clock-skew", "cross-machine-clock-skew-job-stuck-99", "zhihu-yiye", "cs", "article", "published", {
    publishedAt: "2026-09-16",
    totals: t(6_733, 298, 402, 44),
  }),
  pub("zh-tests-rule", "w-tests-rule", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-09-18",
    totals: t(7_402, 351, 590, 64),
  }),
  pub("zh-ai-frontend", "ai-frontend-info-design-first", "zhihu-yiye", "ai-eng", "article", "published", {
    publishedAt: "2026-09-24",
    totals: t(8_214, 412, 655, 37),
  }),
  pub("xhs-ai-frontend", "ai-frontend-info-design-first", "xhs-yiye", "tips", "cards", "scheduled", { plannedFor: "2026-10-10" }),
  pub("zh-r2-oci", "cloudflare-r2-oci-registry-large-layer-upload", "zhihu-yiye", "cs", "article", "published", {
    publishedAt: "2026-09-30",
    totals: t(3_120, 121, 236, 17),
  }),
  pub("zh-edge-answer", "edge-address-bar-copy-empty", "zhihu-yiye", "cs", "answer", "published", {
    publishedAt: "2026-10-02",
    question: "Edge 浏览器复制网址后粘贴为空，怎么解决？",
    totals: t(1_960, 74, 58, 12),
  }),
  pub("zh-design-extraction", "design-extraction-saas-dashboard", "zhihu-yiye", "ai-eng", "article", "pending-link", {
    plannedFor: "2026-10-06",
  }),
  pub("zh-reasoning", "reasoning-content-must-be-passed-back", "zhihu-yiye", "ai-eng", "article", "draft"),
  pub("zh-jev", "jev-classification-fallback-option", "zhihu-yiye", "ai-eng", "article", "scheduled", { plannedFor: "2026-10-09" }),
  pub("zh-leafpress-intro", "w-leafpress-intro", "zhihu-yiye", "ai-eng", "article", "draft"),
  pub("zh-fleet-truncation", "w-fleet-truncation", "zhihu-yiye", "ai-eng", "article", "draft"),
  pub("wx-acg-182", "w-acg-182", "wechat-acg", "wallpaper", "post", "published", { publishedAt: "2026-07-28", totals: t(386, 29, 0, 2) }),
  pub("wx-acg-183", "w-acg-183", "wechat-acg", "wallpaper", "post", "published", { publishedAt: "2026-07-28", totals: t(412, 36, 0, 3) }),
  pub("wx-acg-184", "w-acg-184", "wechat-acg", "wallpaper", "post", "draft"),
  pub("blog-tunnel-access", "w-tunnel-access", "blog-chaosyn", "cloudflare", "article", "scheduled", { plannedFor: "2026-10-09" }),
]

/** 有改投版本的博客作品，更新日期取最后一个版本的日期 */
const LATER_UPDATES: Record<string, DayKey> = {
  "chatgpt-mcp-3a94342e": "2026-07-29",
  "prompt-subagent-ai-36c4342e": "2026-06-03",
  "ai-agent-3114342e": "2026-03-01",
  "cloudflare-workers-ai-3594342e": "2026-05-09",
  "saas-nextdevtpl-2-x-saas-3ae4342e": "2026-08-02",
  "cloudflare-tunnel-ssh-3bd4342e": "2026-10-07",
  "minimax-h3-rtx-5090-speed-cost": "2026-09-08",
  "cross-machine-clock-skew-job-stuck-99": "2026-09-16",
  "ai-frontend-info-design-first": "2026-09-24",
  "cloudflare-r2-oci-registry-large-layer-upload": "2026-09-30",
  "edge-address-bar-copy-empty": "2026-10-02",
  "design-extraction-saas-dashboard": "2026-10-06",
  "reasoning-content-must-be-passed-back": "2026-10-08",
  "jev-classification-fallback-option": "2026-10-07",
}

/** 跟工具运行挂钩的博客作品 */
const BLOG_RUNS: Record<string, string> = {
  "design-extraction-saas-dashboard": "run-01",
  "cloudflare-tunnel-ssh-3bd4342e": "run-02",
  "reasoning-content-must-be-passed-back": "run-09",
  "edge-address-bar-copy-empty": "run-07",
  "ai-frontend-info-design-first": "run-08",
}

export const WORKS: Work[] = [
  ...blogWorks.map((work) => ({
    ...work,
    updatedAt: LATER_UPDATES[work.id] ?? work.updatedAt,
    ...(BLOG_RUNS[work.id] ? { runId: BLOG_RUNS[work.id] } : {}),
  })),
  ...otherWorks,
]

export const PUBLICATIONS: Publication[] = [...blogPubs, ...otherPubs]

export function workById(id: string): Work {
  const work = WORKS.find((item) => item.id === id)
  if (!work) throw new Error(`没有这个作品：${id}`)
  return work
}

export function publicationsOf(workId: string): Publication[] {
  return PUBLICATIONS.filter((item) => item.workId === workId)
}
