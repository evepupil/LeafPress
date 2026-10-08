import { LATEST_DAY, diffDays } from "./clock"
import { seededRandom } from "./rng"
import type { DayKey, IsoTime, Work, WorkLog, WorkSource, WorkStatus, WorkTotals } from "./types"
import { workflowById } from "./workflows"

/**
 * 作品：一个作品只对应一个平台、一个账号，也是一条任务。
 * 博客的 39 篇中文文章是真实的（标题、日期、标签、字数、图片和代码块数照博客仓库），访问量是生成的；
 * 知乎、小红书、B站的作品和它们的数据都是编的，清单见 web/DESIGN.md 第 9 章。
 */

/** 每个作品的任务文件夹：中间产物、要你做的事、你的反馈都在这里，任何 agent 读它就能接着干 */
export function taskFolder(workId: string): string {
  return `~/.leafpress/tasks/${workId}`
}

/** 博客原稿在本机的位置 */
const BLOG_DIR = "C:\\code\\yeton-blog\\content\\posts\\zh"
/** 只有这一篇是 .md，其余都是 .mdx */
const MD_FILES = new Set(["cloudflare-worker-反代网站为什么有的网站能用有的网站一上来就是403"])

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

/** 博客访问量是生成的：越老的文章累计越多，个别文章额外加权 */
const BLOG_BOOST: Record<string, number> = {
  "chatgpt-mcp-3a94342e": 2.4,
  "ai-agent-3114342e": 2.2,
  "cloudflare-worker-2ad4342e": 1.8,
  "pixiv-2a94342e": 1.6,
  "ai-frontend-info-design-first": 1.5,
}

/** 博客的数据照 Umami 和 giscus：访问、访客、评论 */
function blogTotals(slug: string, published: DayKey): WorkTotals {
  const random = seededRandom(`blog-reads:${slug}`)
  const age = diffDays(LATEST_DAY, published) + 1
  const ageFactor = Math.min(1, 0.35 + age / 120)
  const pageviews = Math.round((600 + random() * 3000) * ageFactor * (BLOG_BOOST[slug] ?? 1))
  const comments = Math.round(pageviews * (0.002 + random() * 0.004))
  const visitors = Math.round(pageviews * (0.62 + random() * 0.16))
  return { pageviews, visitors, comments }
}

/** 知乎的数据：浏览、点赞、收藏、评论，再按点赞数生成分享 */
function zhihuTotals(id: string, [views, likes, collects, comments]: [number, number, number, number]): WorkTotals {
  const random = seededRandom(`zhihu-shares:${id}`)
  const shares = Math.round(likes * (0.05 + random() * 0.07))
  return { views, likes, collects, comments, shares }
}

const at = (day: DayKey, time = "10:00:00"): IsoTime => `${day}T${time}+08:00`

const blogWorks: Work[] = BLOG_POSTS.map(([slug, title, date, tags, origin, words, images, codeBlocks]) => {
  const tagList = tags.split("/")
  return {
    id: slug,
    title,
    accountId: "blog-chaosyn",
    status: "done",
    brief: "从博客仓库导入的已发布文章。",
    source: { kind: "import" },
    workflowId: "blog-write",
    step: workflowById("blog-write").steps.length,
    order: 0,
    createdAt: at(date),
    updatedAt: at(date),
    url: `https://blog.chaosyn.com/posts/${slug}/`,
    publishedAt: date,
    totals: blogTotals(slug, date),
    localPath: `${BLOG_DIR}\\${slug}.${MD_FILES.has(slug) ? "md" : "mdx"}`,
    sourceRef: `zh/${slug}`,
    origin,
    tags: tagList,
    words,
    images,
    codeBlocks,
    log: [{ at: at(date), text: "从博客仓库导入" }],
  }
})

const blogTitle = (slug: string) => BLOG_POSTS.find(([id]) => id === slug)?.[1] ?? slug

interface Draft {
  id: string
  title?: string
  accountId: string
  status: WorkStatus
  brief: string
  source: WorkSource
  workflowId: string
  step?: number
  order?: number
  createdAt: IsoTime
  updatedAt?: IsoTime
  publishedAt?: DayKey
  /** 知乎作品的 [浏览, 点赞, 收藏, 评论]，分享按点赞数生成 */
  totals?: [number, number, number, number]
  question?: string
  tags?: string[]
  words?: number
  feedback?: string
  log?: WorkLog[]
}

/** 不是博客导入的作品：知乎、小红书、B站，以及新写的博客 */
function make(draft: Draft): Work {
  const workflow = workflowById(draft.workflowId)
  const title = draft.title ?? (draft.source.kind === "work" ? blogTitle(draft.source.workId) : draft.id)
  const done = draft.status === "done"
  const step = done ? workflow.steps.length : (draft.step ?? 0)
  const current = workflow.steps[step]
  const ask = draft.status === "waiting" && current?.ask ? current.ask.replaceAll("{folder}", taskFolder(draft.id)) : undefined
  const sourceText =
    draft.source.kind === "work" ? `由《${blogTitle(draft.source.workId)}》转来` : draft.source.kind === "idea" ? "由灵感转来" : "直接新建"
  return {
    id: draft.id,
    title,
    accountId: draft.accountId,
    status: draft.status,
    brief: draft.brief,
    source: draft.source,
    workflowId: draft.workflowId,
    step,
    ...(ask ? { ask } : {}),
    ...(draft.feedback ? { feedback: draft.feedback } : {}),
    order: draft.order ?? 0,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt ?? draft.createdAt,
    ...(done && draft.publishedAt
      ? {
          url:
            draft.workflowId === "blog-to-zhihu-answer"
              ? `https://www.zhihu.com/question/demo/answer/${draft.id}`
              : `https://zhuanlan.zhihu.com/p/demo-${draft.id}`,
          publishedAt: draft.publishedAt,
          totals: zhihuTotals(draft.id, draft.totals ?? [0, 0, 0, 0]),
        }
      : {}),
    ...(draft.question ? { question: draft.question } : {}),
    tags: draft.tags ?? [],
    ...(draft.words ? { words: draft.words } : {}),
    log: draft.log ?? [
      { at: draft.createdAt, text: `创建，${sourceText}，用「${workflow.name}」工作流` },
      ...(done && draft.publishedAt ? [{ at: at(draft.publishedAt, "21:30:00"), text: "发布，链接已归档" }] : []),
    ],
  }
}

const fromBlog = (slug: string): WorkSource => ({ kind: "work", workId: slug })
const ZHIHU = "zhihu-yiye"

/** 已发的知乎作品：[编号, 来源博客, 发布日期, 浏览, 点赞, 收藏, 评论] */
const ZHIHU_DONE: [string, string, DayKey, number, number, number, number][] = [
  ["z-chatgpt-mcp", "chatgpt-mcp-3a94342e", "2026-07-29", 15_620, 702, 1_380, 88],
  ["z-prompt-subagent", "prompt-subagent-ai-36c4342e", "2026-05-28", 21_904, 1_105, 2_310, 96],
  ["z-ai-agent", "ai-agent-3114342e", "2026-03-01", 12_450, 640, 1_512, 58],
  ["z-workers-ai", "cloudflare-workers-ai-3594342e", "2026-05-09", 4_310, 166, 248, 22],
  ["z-nextdevtpl", "saas-nextdevtpl-2-x-saas-3ae4342e", "2026-08-02", 2_870, 118, 205, 19],
  ["z-tunnel-ssh", "cloudflare-tunnel-ssh-3bd4342e", "2026-08-17", 5_480, 231, 512, 30],
  ["z-minimax-5090", "minimax-h3-rtx-5090-speed-cost", "2026-09-08", 4_905, 187, 260, 35],
  ["z-clock-skew", "cross-machine-clock-skew-job-stuck-99", "2026-09-16", 6_733, 298, 402, 44],
  ["z-ai-frontend", "ai-frontend-info-design-first", "2026-09-24", 8_214, 412, 655, 37],
  ["z-r2-oci", "cloudflare-r2-oci-registry-large-layer-upload", "2026-09-30", 3_120, 121, 236, 17],
]

const zhihuDone: Work[] = ZHIHU_DONE.map(([id, slug, day, reads, likes, collects, comments]) =>
  make({
    id,
    accountId: ZHIHU,
    status: "done",
    brief: "照知乎写法改写，文末附博客原文链接。",
    source: fromBlog(slug),
    workflowId: "blog-to-zhihu",
    createdAt: at(day, "09:00:00"),
    updatedAt: at(day, "21:30:00"),
    publishedAt: day,
    totals: [reads, likes, collects, comments],
  }),
)

const otherWorks: Work[] = [
  make({
    id: "z-prompt-subagent-answer",
    title: "如何系统地学习 AI 工程化？（回答）",
    accountId: ZHIHU,
    status: "done",
    brief: "用《从 Prompt 到 Subagent》回答这个问题，开头先给学习顺序。",
    source: fromBlog("prompt-subagent-ai-36c4342e"),
    workflowId: "blog-to-zhihu-answer",
    createdAt: at("2026-06-02", "20:00:00"),
    updatedAt: at("2026-06-03", "21:30:00"),
    publishedAt: "2026-06-03",
    question: "如何系统地学习 AI 工程化？",
    totals: [9_870, 512, 846, 41],
  }),
  make({
    id: "z-edge-answer",
    title: "Edge 浏览器复制网址后粘贴为空，怎么解决？（回答）",
    accountId: ZHIHU,
    status: "done",
    brief: "用 Edge 那篇复盘回答，三步说清开关在哪。",
    source: fromBlog("edge-address-bar-copy-empty"),
    workflowId: "blog-to-zhihu-answer",
    createdAt: at("2026-10-01", "21:00:00"),
    updatedAt: at("2026-10-02", "21:30:00"),
    publishedAt: "2026-10-02",
    question: "Edge 浏览器复制网址后粘贴为空，怎么解决？",
    totals: [1_960, 74, 58, 12],
  }),
  make({
    id: "z-claude-md",
    title: "CLAUDE.md 是什么，怎么写才会被执行",
    accountId: ZHIHU,
    status: "done",
    brief: "讲清 CLAUDE.md 的加载方式和失效场景，要硬拦的动作交给 hooks。",
    source: { kind: "none" },
    workflowId: "zhihu-write",
    createdAt: at("2026-09-08", "20:00:00"),
    updatedAt: at("2026-09-10", "21:30:00"),
    publishedAt: "2026-09-10",
    tags: ["Claude Code"],
    words: 2180,
    totals: [18_330, 966, 1_702, 121],
  }),
  make({
    id: "z-tests-rule",
    title: "AI 写代码的项目，哪些代码必须写测试、哪些禁止写",
    accountId: ZHIHU,
    status: "done",
    brief: "两条规矩各配一句失效机制：核心逻辑必须测，纯展示禁止测。",
    source: { kind: "none" },
    workflowId: "zhihu-write",
    createdAt: at("2026-09-16", "20:00:00"),
    updatedAt: at("2026-09-18", "21:30:00"),
    publishedAt: "2026-09-18",
    tags: ["测试"],
    words: 1960,
    totals: [7_402, 351, 590, 64],
  }),
  // ---------- 等你处理 ----------
  make({
    id: "z-design-extraction",
    accountId: ZHIHU,
    status: "waiting",
    step: 5,
    brief: "照知乎写法改写，突出「把规则锁进主题」这一条；文末附博客原文链接。",
    source: fromBlog("design-extraction-saas-dashboard"),
    workflowId: "blog-to-zhihu",
    createdAt: at("2026-10-06", "21:10:00"),
    updatedAt: at("2026-10-06", "21:31:00"),
    log: [
      { at: at("2026-10-06", "21:10:00"), text: "创建，由《只凭一份设计提炼做 SaaS 后台》转来，用「博客转知乎」工作流" },
      { at: at("2026-10-06", "21:24:00"), text: "AI 改写完成，删掉了 18% 的篇幅" },
      { at: at("2026-10-06", "21:24:12"), text: "自查标出 2 句可疑，已在改写稿里标黄" },
      { at: at("2026-10-06", "21:31:00"), text: "复制页已生成，等你去知乎投递" },
    ],
  }),
  make({
    id: "z-leafpress-intro",
    title: "LeafPress：把一份原稿变成多个平台的版本",
    accountId: ZHIHU,
    status: "waiting",
    step: 1,
    brief: "介绍 LeafPress：灵感、作品、工作流怎么串起来，重点讲任务文件夹让任何 agent 都能接手。",
    source: { kind: "idea", ideaId: "i-17" },
    workflowId: "zhihu-write",
    createdAt: at("2026-10-07", "22:30:00"),
    updatedAt: at("2026-10-07", "22:41:00"),
    log: [
      { at: at("2026-10-07", "22:30:00"), text: "创建，由灵感转来，用「知乎写作」工作流" },
      { at: at("2026-10-07", "22:41:00"), text: "大纲写好了，五节，等你确认" },
    ],
  }),
  make({
    id: "x-ai-frontend",
    title: "6 张图讲清：AI 做的页面为什么像模板货",
    accountId: "xhs-yiye",
    status: "waiting",
    step: 3,
    brief: "把《AI 做的页面像模板货又空心》提炼成 6 张卡片：先信息设计，再写数字规格。",
    source: fromBlog("ai-frontend-info-design-first"),
    workflowId: "to-xhs-cards",
    createdAt: at("2026-10-07", "09:00:00"),
    updatedAt: at("2026-10-07", "09:20:00"),
  }),
  make({
    id: "v-tunnel-ssh",
    title: "Cloudflare Tunnel 实现 ssh 穿透 · 录屏版",
    accountId: "bili-yiye",
    status: "waiting",
    step: 4,
    brief: "做成 10 分钟以内的录屏教程，只讲 ssh 穿透这一件事。",
    source: fromBlog("cloudflare-tunnel-ssh-3bd4342e"),
    workflowId: "video-pipeline",
    createdAt: at("2026-10-07", "19:00:00"),
    updatedAt: at("2026-10-07", "20:44:00"),
    log: [
      { at: at("2026-10-07", "19:00:00"), text: "创建，由《Cloudflare Tunnel 实现ssh穿透》转来，用「录屏成片」工作流" },
      { at: at("2026-10-07", "19:12:00"), text: "录屏脚本写好了" },
      { at: at("2026-10-07", "20:05:00"), text: "你的反馈：录好了，18 分 42 秒" },
      { at: at("2026-10-07", "20:31:00"), text: "剪掉没说话的片段，剩 9 分 15 秒" },
      { at: at("2026-10-07", "20:44:00"), text: "字幕 214 句，12 处技术名词标了「?」，等你校对" },
    ],
  }),
  // ---------- 进行中 ----------
  make({
    id: "z-reasoning",
    accountId: ZHIHU,
    status: "doing",
    step: 1,
    brief: "改写成知乎文章，开头直接给报错信息和结论，方便搜报错的人。",
    source: fromBlog("reasoning-content-must-be-passed-back"),
    workflowId: "blog-to-zhihu",
    createdAt: at("2026-10-08", "09:12:00"),
    updatedAt: at("2026-10-08", "09:12:30"),
    log: [
      { at: at("2026-10-08", "09:12:00"), text: "创建，由《DeepSeek 思考模式下多轮工具调用中断报 400》转来，用「博客转知乎」工作流" },
      { at: at("2026-10-08", "09:12:30"), text: "原稿读完：2,661 字，3 段代码；AI 在改写" },
    ],
  }),
  // ---------- 待实现（按先后） ----------
  make({
    id: "b-tunnel-access",
    title: "用 Cloudflare Tunnel 加 Access，把本机服务安全地开放给手机",
    accountId: "blog-chaosyn",
    status: "todo",
    order: 1,
    brief: "实战文：为什么不直接暴露端口；Tunnel 加 Access 的配置步骤；手机上怎么登录；踩过的坑。中英双语。",
    source: { kind: "idea", ideaId: "i-03" },
    workflowId: "blog-write",
    createdAt: at("2026-10-04", "10:00:00"),
  }),
  make({
    id: "z-fleet-truncation",
    title: "派便宜模型写代码：一次输出 3.3 万字就截断，任务书要写明分步落盘",
    accountId: ZHIHU,
    status: "todo",
    order: 2,
    brief: "写成知乎说明文：便宜模型一次输出太长会被截断；任务书要写明分步落盘。素材在 LeafPress 进度 10 月 5 日检查点 3。",
    source: { kind: "idea", ideaId: "i-02" },
    workflowId: "zhihu-write",
    createdAt: at("2026-10-05", "22:45:00"),
  }),
  make({
    id: "z-jev",
    accountId: ZHIHU,
    status: "todo",
    order: 3,
    brief: "改写成知乎文章，标题突出「分类选项必须留一个兜底项」。",
    source: fromBlog("jev-classification-fallback-option"),
    workflowId: "blog-to-zhihu",
    createdAt: at("2026-10-07", "10:00:00"),
  }),
  make({
    id: "z-hourly-rate",
    title: "一人公司怎么算每个副业的时薪",
    accountId: ZHIHU,
    status: "todo",
    order: 4,
    brief: "讲清任务、时间、收支三样怎么连起来算时薪，举 DeverDesk 的做法。",
    source: { kind: "idea", ideaId: "i-04" },
    workflowId: "zhihu-write",
    createdAt: at("2026-10-03", "10:30:00"),
  }),
  make({
    id: "z-vacuum-into",
    title: "SQLite 升级前备份：为什么用 VACUUM INTO 而不是复制文件",
    accountId: ZHIHU,
    status: "todo",
    order: 5,
    brief: "讲清有人读库时复制文件为什么会漏掉 WAL 里的数据，VACUUM INTO 怎么保证一致。",
    source: { kind: "idea", ideaId: "i-05" },
    workflowId: "zhihu-write",
    createdAt: at("2026-10-06", "08:20:00"),
  }),
  make({
    id: "z-tunnel-access",
    title: "把本机服务给手机用，为什么不该直接开端口",
    accountId: ZHIHU,
    status: "todo",
    order: 6,
    brief: "和博客那篇同一个选题的知乎版：先讲直接开端口的风险，再讲 Tunnel 加 Access。",
    source: { kind: "idea", ideaId: "i-03" },
    workflowId: "zhihu-write",
    createdAt: at("2026-10-04", "10:00:00"),
  }),
]

/** 全部作品：博客导入的 39 篇 + 知乎已发 14 篇 + 进行中的 11 个 */
export const WORKS: Work[] = [...blogWorks, ...zhihuDone, ...otherWorks]

export function workById(id: string): Work {
  const work = WORKS.find((item) => item.id === id)
  if (!work) throw new Error(`没有这个作品：${id}`)
  return work
}
