/**
 * 跑灵感的纯规则：候选的键、知乎问题链接和编号的认法、标题对题、ISO 周、状态挡不挡、三类打分、候选池裁剪和排序。
 * 都是纯函数：不读文件、不联网、不取当前时间（时间由调用方传进来）。规格见 docs/模块设计/灵感-跑灵感.md「打分和候选池」。
 */
import { addDays, dayOf, diffDays, weekStartOf } from "../dates/index.ts"
import type { DayKey, DevlogPayload, FollowupPayload, IdeaCandidate, IsoTime, QuestionVia, Work } from "../types/index.ts"

/** 跳过的候选多少天内不再进池 */
export const SKIP_COOLDOWN_DAYS = 14

/** 候选池每类各自的上限；溢出项由调用方删除（续写 3：真实数据里一次有用的续写很少） */
export const POOL_LIMITS: Record<IdeaCandidate["kind"], number> = { question: 20, followup: 3, devlog: 5 }

/** 问题按怎么找到的粗排：博客反找最准（实测博客标题当主题词推回来的问题很对题），热榜最泛 */
export const VIA_WEIGHTS: Record<QuestionVia, number> = { blog: 30, topic: 20, personal: 15, hot: 10 }

/**
 * 问句里的通用说法，算标题相似时不算数（真实数据里「有哪些」「推荐」让一堆不相干的问题都关联到同两篇作品）。
 * 全部是汉字双字词，和切词的粒度一致。
 */
export const GENERIC_BIGRAMS: ReadonlySet<string> = new Set([
  "如何",
  "何看",
  "看待",
  "怎么",
  "怎样",
  "为什",
  "什么",
  "有哪",
  "哪些",
  "推荐",
  "可以",
  "是否",
  "应该",
  "评价",
  "一个",
  "这个",
  "那个",
  "我们",
  "你们",
  "他们",
  "自己",
  "没有",
  "有没",
  "现在",
  "一些",
  "的人",
  "大家",
  "觉得",
  "知道",
  "问题",
  "方法",
  "时候",
  "能不",
  "不能",
  "是不",
  "不是",
  "还是",
  "真的",
  "为何",
  "有什",
  "么样",
  "样的",
  "的是",
  "是什",
])

/** 知乎问题候选的键：同一个问题不管怎么找到的都一样，才能合并成一条 */
export function questionKey(questionId: string): string {
  return `zq:${questionId}`
}

/** 已发作品续写的键 */
export function followupKey(workId: string): string {
  return `wf:${workId}`
}

/**
 * 开发记录的键：带完整路径（转小写、反斜杠换成 /、去掉末尾的 /）和 ISO 周。
 * 只用项目名的话，两个根下有同名项目会撞成一条。
 */
export function devlogKey(path: string, week: string): string {
  const normalized = path.replaceAll("\\", "/").toLowerCase().replace(/\/+$/, "")
  return `dev:${normalized}:${week}`
}

/**
 * 知乎问题链接的认法：按网址解析，主机必须是 zhihu.com 或 www.zhihu.com（http/https 都行，没写协议也认），
 * 路径以 /question/<数字> 开头，数字后面只能是结尾、/、?、#。zhuanlan.zhihu.com 这类一律认不出（查询串里带问题链接也不算）。
 */
const QUESTION_URL = /^(?:https?:\/\/)?(?:www\.)?zhihu\.com\/question\/(\d+)(?=[/?#]|$)/i

/**
 * 文字里找问题链接：zhihu.com 前面必须是行首、空白、标点（中文标点、括号都算）这类边界，
 * 不能是别的域名的一部分：字母数字、点、连字符直接相连不算边界；单个 / 且前面是字母数字的也不算
 * （那是 example.com 这类域名的路径）；https:// 的 // 算边界。编号后面也得是边界（/question/123abc 不认）。
 * 带 u 才能在 lookbehind 里用 \p{P}。
 */
const QUESTION_URL_IN_TEXT = /(?<=[\s\p{P}]|^)(?<![0-9A-Za-z]\/)(?<![-._])(?:www\.)?zhihu\.com\/question\/(\d+)(?![a-z0-9])/giu

/** 从知乎问题链接里取问题编号；认不出返回 undefined（文字里找链接用 questionIdsIn） */
export function questionIdOf(url: string): string | undefined {
  return QUESTION_URL.exec(url.trim())?.[1]
}

/** 文字里出现的所有知乎问题编号，去重，按出现先后 */
export function questionIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(QUESTION_URL_IN_TEXT)].map((m) => m[1]!))]
}

/** 知乎页面的「 - 知乎」后缀，横线的几种写法和大小写都认 */
const ZHIHU_TITLE_SUFFIX = /[-−–—]\s*知乎$/i

/**
 * 比标题用：转小写，去掉末尾「 - 知乎」，再去掉所有空白和标点（中英文标点、引号、括号、问号都算）。
 * + 和 # 留着：C++、C#、F# 这类名字去掉就分不出了。剩下空串时返回空串（空串不算对上，调用方挡题时不拿它比较）。
 */
export function titleKey(title: string): string {
  const stripped = title.toLowerCase().replace(ZHIHU_TITLE_SUFFIX, "")
  // 去掉 Unicode 的空白、标点和符号类字符（中文标点（，。？！）、英文标点（,?!）、引号括号、制表换行、＄￥……），但放过 + 和 #
  return stripped.replace(/(?!\+|#)[\s\p{P}\p{S}]/gu, "")
}

/**
 * ISO 8601 周（周一开始），形如 2026-W43。跨年归属按「该周的周四落在哪年就是哪年」（等价于 1 月 4 日必在第一周），
 * 所以 2026-12-31 和 2027-01-01 都是 2026-W53。
 */
export function isoWeek(day: DayKey): string {
  // 该周的周四决定 ISO 年；周一起点用 dates 里现成的工具算
  const thursday = addDays(weekStartOf(day), 3)
  const isoYear = Number(thursday.slice(0, 4))
  const week1Start = weekStartOf(`${isoYear}-01-04`)
  const week = Math.floor(diffDays(day, week1Start) / 7) + 1
  return `${isoYear}-W${String(week).padStart(2, "0")}`
}

/**
 * 候选挡不挡再进池：已推、不要永远挡；跳过从 updatedAt 那天起 14 天内挡。
 * 冷却按日历日比：满 14 天（now 的日期 ≥ updatedAt 的日期 + 14 天）就算过了，不再挡。
 */
export function isBlocked(candidate: IdeaCandidate | undefined, now: IsoTime): boolean {
  if (!candidate) return false
  if (candidate.state === "new") return false
  if (candidate.state === "skipped") return dayOf(candidate.updatedAt) > addDays(dayOf(now), -SKIP_COOLDOWN_DAYS)
  return true
}

/** 知乎问题打分：最高的找法权重 + 每多一种找法加 5 + 有相关作品加 10 */
export function scoreQuestion(input: { via: QuestionVia[]; relatedWorkIds: string[] }): number {
  if (!input.via.length) return input.relatedWorkIds.length > 0 ? 10 : 0
  const base = Math.max(...input.via.map((via) => VIA_WEIGHTS[via]))
  return base + (input.via.length - 1) * 5 + (input.relatedWorkIds.length > 0 ? 10 : 0)
}

/** 问题打分用：via 里权重最高的那个；空数组返回 undefined */
export function primaryVia(via: QuestionVia[]): QuestionVia | undefined {
  return via.reduce<QuestionVia | undefined>(
    (best, current) => (best === undefined || VIA_WEIGHTS[current] > VIA_WEIGHTS[best] ? current : best),
    undefined,
  )
}

/** 续写打分：近 7 天增长为主，累计只用来分先后（÷ 1000000 后小到不改变增长的先后段） */
export function scoreFollowup(payload: FollowupPayload): number {
  return payload.growth + payload.reach / 1_000_000
}

/** 开发记录打分：提交条数 + 进度流水文件数 × 3（一份流水的工作量抵三次提交） */
export function scoreDevlog(payload: DevlogPayload): number {
  return payload.commits.length + payload.logs.length * 3
}

/** 标题切词：去标点和空白后，连续的字母数字算一个词（2 个字符以上才算），相邻两个汉字算一个词，再去掉通用词 */
function tokensOf(title: string): string[] {
  const cleaned = titleKey(title)
  const tokens: string[] = []
  // 先按汉字段 / 字母数字段切开，汉字只在段内两两组合，不跨段拼词；通用词在这里去，后面的交集和分母都干净
  for (const segment of cleaned.matchAll(/[a-z0-9]+|[\u4e00-\u9fff]+/g)) {
    const text = segment[0]
    if (/[a-z0-9]/.test(text)) {
      if (text.length >= 2 && !GENERIC_BIGRAMS.has(text)) tokens.push(text)
    } else {
      for (let i = 0; i + 1 < text.length; i++) {
        const token = text.slice(i, i + 2)
        if (!GENERIC_BIGRAMS.has(token)) tokens.push(token)
      }
    }
  }
  return tokens
}

/**
 * 标题和哪些作品对得上：两边词的交集 ÷ 较少一边的词数 ≥ 0.2，且交集至少 2 个词才算相关（交集和词数都按去重后的词集合算，
 * 不然「哈哈哈哈」和「哈哈」会交集 2 个词跟真相关混淆）。
 * 按相似度从高到低、再按作品编号，最多 limit 个。
 */
export function relatedWorkIds(title: string, works: readonly Pick<Work, "id" | "title">[], limit = 3): string[] {
  // 去重后的词集合：重复的词只算一个，交集和分母都用它
  const titleTokens = [...new Set(tokensOf(title))]
  const scored = works.flatMap((work) => {
    const workTokens = [...new Set(tokensOf(work.title))]
    const smaller = Math.min(titleTokens.length, workTokens.length)
    if (!smaller) return []
    const set = new Set(workTokens)
    const intersection = titleTokens.filter((token) => set.has(token)).length
    const similarity = intersection / smaller
    if (similarity < 0.2 || intersection < 2) return []
    return [{ workId: work.id, similarity }]
  })
  return scored
    .sort((a, b) => b.similarity - a.similarity || a.workId.localeCompare(b.workId))
    .slice(0, Math.max(0, limit))
    .map((item) => item.workId)
}

/**
 * 进池和补摘要共用的问题挑选：按 primaryVia 分成 personal、topic、blog、hot 四组，组内按 score 从高到低、再按输入先后，
 * 然后按 personal、topic、blog、hot 的顺序轮流各取一个，某组取完就跳过，直到取满 limit 或全取完；
 * 返回取中的，顺序就是取的顺序。via 为空的排在四组之后（取完四组再取）。
 * 真实数据里按分数一刀切，个性化推荐的 20 个问题一个都没进池，轮流取才保证各找法都有代表。
 */
export function pickQuestions<T extends { via: QuestionVia[]; score: number }>(items: T[], limit: number): T[] {
  const groups = new Map<QuestionVia | "none", T[]>()
  for (const item of items) {
    const key = primaryVia(item.via) ?? "none"
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  // 组内排序不改动输入数组：先复制
  const order: (QuestionVia | "none")[] = ["personal", "topic", "blog", "hot", "none"]
  const queues = order.flatMap((key) => {
    const group = groups.get(key)
    return group ? [[...group].sort((a, b) => b.score - a.score)] : []
  })
  const picked: T[] = []
  // 轮流取：每轮从每组头部各拿一个，取完的组跳过
  while (picked.length < limit) {
    let took = false
    for (const queue of queues) {
      const next = queue.shift()
      if (next !== undefined) {
        picked.push(next)
        took = true
        if (picked.length >= limit) break
      }
    }
    if (!took) break
  }
  return picked
}

/** 候选池里怎么比先后：score 从高到低，再按 updatedAt 新的在前，再按 id（确定性排序，同分不靠运气） */
function compareCandidates(a: IdeaCandidate, b: IdeaCandidate): number {
  return b.score - a.score || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
}

/**
 * 裁剪候选池：只看 new 的。问题用 pickQuestions（各找法轮流，不按分数一刀切）留 20；
 * 续写、开发记录各按 score 从高到低（再按 updatedAt 新的在前、再按 id）留 3 和 5。多出来的进 overflow（调用方标成跳过）。
 * 非 new 的不参与（已推、不要、跳过的不动）。
 */
export function trimPool(pool: IdeaCandidate[]): { keep: IdeaCandidate[]; overflow: IdeaCandidate[] } {
  const keep: IdeaCandidate[] = []
  const overflow: IdeaCandidate[] = []
  // 问题的保留顺序就是 pickQuestions 的轮流顺序；溢出的按同样的顺序排在后面
  const questions = pool.filter((candidate) => candidate.kind === "question" && candidate.state === "new")
  // pickQuestions 要顶层 via：问题的 via 在 payload 里，这里包一层传进去
  const picked = pickQuestions(
    questions.flatMap((candidate) =>
      candidate.payload.kind === "question" ? [{ candidate, via: candidate.payload.via, score: candidate.score }] : [],
    ),
    POOL_LIMITS.question,
  ).map((item) => item.candidate)
  const pickedSet = new Set(picked)
  // 保留的按轮流取的顺序；挤出去的按输入先后排在 overflow 里
  keep.push(...picked)
  for (const candidate of questions) if (!pickedSet.has(candidate)) overflow.push(candidate)
  for (const kind of ["followup", "devlog"] as const) {
    const ranked = pool.filter((candidate) => candidate.kind === kind && candidate.state === "new").sort(compareCandidates)
    for (let i = 0; i < ranked.length; i++) (i < POOL_LIMITS[kind] ? keep : overflow).push(ranked[i]!)
  }
  return { keep, overflow }
}

/** 列候选用：类按问题、续写、开发记录；类里按 score 从高到低，再按 id */
export function sortCandidates(list: IdeaCandidate[]): IdeaCandidate[] {
  const kindOrder: Record<IdeaCandidate["kind"], number> = { question: 0, followup: 1, devlog: 2 }
  return [...list].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || b.score - a.score || a.id.localeCompare(b.id))
}
