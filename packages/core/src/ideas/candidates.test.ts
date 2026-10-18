import { describe, expect, it } from "vitest"

import type { CandidateState, IdeaCandidate, QuestionVia, Work } from "../types/index.ts"
import {
  GENERIC_BIGRAMS,
  POOL_LIMITS,
  SKIP_COOLDOWN_DAYS,
  VIA_WEIGHTS,
  devlogKey,
  followupKey,
  isBlocked,
  isoWeek,
  pickQuestions,
  primaryVia,
  questionIdOf,
  questionIdsIn,
  questionKey,
  relatedWorkIds,
  scoreDevlog,
  scoreFollowup,
  scoreQuestion,
  sortCandidates,
  titleKey,
  trimPool,
} from "./candidates.ts"

const now = "2026-10-19T09:00:00+08:00"

function candidate(id: string, overrides: Partial<IdeaCandidate> = {}): IdeaCandidate {
  return {
    id,
    key: `zq:${id}`,
    kind: "question",
    title: `问题 ${id}`,
    url: "https://www.zhihu.com/question/1",
    accountId: "zhihu-1",
    score: 0,
    state: "new",
    payload: { kind: "question", questionId: "1", via: ["personal"], topics: [], blogWorkIds: [], answerSummaries: [], relatedWorkIds: [] },
    firstSeenAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** pickQuestions 只要 via 和 score，用这个拼输入 */
function pickable(id: string, via: QuestionVia[], score: number) {
  return { id, via, score }
}

function questionPayload(via: QuestionVia[]): IdeaCandidate["payload"] {
  return { kind: "question", questionId: "1", via, topics: [], blogWorkIds: [], answerSummaries: [], relatedWorkIds: [] }
}

function followupPayload(): IdeaCandidate["payload"] {
  return { kind: "followup", workId: "z-1", platform: "zhihu", reach: 0, growth: 0, interactions: 0 }
}

function devlogPayload(): IdeaCandidate["payload"] {
  return { kind: "devlog", repo: "r", path: "C:\\code\\r", week: "2026-W43", commits: [], logs: [] }
}

describe("候选的键", () => {
  it("三类键和常量", () => {
    expect(questionKey("123456789")).toBe("zq:123456789")
    expect(followupKey("b-3")).toBe("wf:b-3")
    expect(SKIP_COOLDOWN_DAYS).toBe(14)
    expect(POOL_LIMITS).toEqual({ question: 20, followup: 3, devlog: 5 })
    expect(VIA_WEIGHTS).toEqual({ blog: 30, topic: 20, personal: 15, hot: 10 })
  })

  it("devlogKey 自己规范化路径：转小写、反斜杠换成 /、去掉末尾斜杠", () => {
    expect(devlogKey("C:\\Code\\LeafPress", "2026-W43")).toBe("dev:c:/code/leafpress:2026-W43")
    expect(devlogKey("C:\\code\\LeafPress\\", "2026-W43")).toBe("dev:c:/code/leafpress:2026-W43")
    expect(devlogKey("C:\\code\\LeafPress\\\\\\", "2026-W43")).toBe("dev:c:/code/leafpress:2026-W43")
    expect(devlogKey("c:/code/leafpress/", "2026-W43")).toBe("dev:c:/code/leafpress:2026-W43")
    // 两个根下有同名项目时靠完整路径区分，不会撞成一条
    expect(devlogKey("C:\\code\\leafpress", "2026-W43")).not.toBe(devlogKey("D:\\work\\leafpress", "2026-W43"))
    // 同一个项目不同周是两条
    expect(devlogKey("C:\\code\\leafpress", "2026-W43")).not.toBe(devlogKey("C:\\code\\leafpress", "2026-W44"))
  })
})

describe("知乎问题链接", () => {
  it("questionIdOf 认各种写法，认不出给 undefined", () => {
    expect(questionIdOf("https://www.zhihu.com/question/19550243")).toBe("19550243")
    expect(questionIdOf("https://zhihu.com/question/19550243")).toBe("19550243")
    expect(questionIdOf("http://www.zhihu.com/question/19550243")).toBe("19550243")
    expect(questionIdOf("https://www.zhihu.com/question/19550243/answer/123456")).toBe("19550243")
    expect(questionIdOf("https://www.zhihu.com/question/19550243?utm_source=hot&utm_medium=social")).toBe("19550243")
    expect(questionIdOf("https://www.zhihu.com/question/19550243#reload")).toBe("19550243")
    // 没写协议也认，首尾空白先去掉
    expect(questionIdOf("zhihu.com/question/19550243")).toBe("19550243")
    expect(questionIdOf("  www.zhihu.com/question/19550243  ")).toBe("19550243")
    // 主机不是 zhihu.com / www.zhihu.com 的一律不认
    expect(questionIdOf("https://zhuanlan.zhihu.com/question/19550243")).toBeUndefined()
    expect(questionIdOf("https://www.zhihu.com/api/v4/questions/19550243")).toBeUndefined()
    expect(questionIdOf("https://zhuanlan.zhihu.com/p/123456789")).toBeUndefined()
    expect(questionIdOf("https://www.zhihu.com/question/ask")).toBeUndefined()
    expect(questionIdOf("https://www.zhihu.com/people/xxx")).toBeUndefined()
    expect(questionIdOf("https://www.baidu.com/question/19550243")).toBeUndefined()
    // 按网址解析：套在别的域名路径里的、粘着文字的、编号后面直接跟字母的都不认
    expect(questionIdOf("https://example.com/zhihu.com/question/789")).toBeUndefined()
    expect(questionIdOf("https://zhuanlan.zhihu.com/p/123?next=https://www.zhihu.com/question/456")).toBeUndefined()
    expect(questionIdOf("/question/123abc")).toBeUndefined()
    expect(questionIdOf("notzhihu.com/question/1")).toBeUndefined()
    expect(questionIdOf("看看 https://www.zhihu.com/question/19550243 这条")).toBeUndefined()
  })

  it("questionIdsIn 取全文里的问题编号，去重并按出现先后", () => {
    expect(questionIdsIn("https://www.zhihu.com/question/111 和 https://www.zhihu.com/question/222")).toEqual(["111", "222"])
    expect(questionIdsIn("222 先来 https://www.zhihu.com/question/222，111 后来 https://www.zhihu.com/question/111")).toEqual([
      "222",
      "111",
    ])
    expect(questionIdsIn("同一条出现两次 https://www.zhihu.com/question/111 https://www.zhihu.com/question/111")).toEqual(["111"])
    expect(questionIdsIn("编号互为前缀的两个都算 https://www.zhihu.com/question/1111 https://www.zhihu.com/question/111")).toEqual([
      "1111",
      "111",
    ])
    // 中文标点、括号后面也认，// 算边界
    expect(questionIdsIn("详情见（zhihu.com/question/888）哦")).toEqual(["888"])
    expect(questionIdsIn("来自//zhihu.com/question/654 的")).toEqual(["654"])
    expect(questionIdsIn("https://zhuanlan.zhihu.com/p/123456789")).toEqual([])
    expect(questionIdsIn("")).toEqual([])
    // 不能是别的域名的一部分：套在别的域名路径里、别的子域的查询串里、编号后直接跟字母的都不认
    expect(questionIdsIn("https://example.com/zhihu.com/question/789")).toEqual([])
    expect(questionIdsIn("https://zhuanlan.zhihu.com/p/123?next=https://www.zhihu.com/question/456")).toEqual(["456"])
    expect(questionIdsIn("/question/123abc")).toEqual([])
    expect(questionIdsIn("https://www.zhihu.com/question/123abc")).toEqual([])
    expect(questionIdsIn("notzhihu.com/question/1")).toEqual([])
    expect(questionIdsIn("a.zhihu.com/question/1")).toEqual([])
    expect(questionIdsIn("x-zhihu.com/question/1")).toEqual([])
    expect(questionIdsIn("汉字直接相连的啊zhihu.com/question/555 也不算")).toEqual([])
  })
})

// works 只用到 id 和 title；这里拼一个最小的完整 Work，免得逐个字段铺
function makeWork(id: string, title: string): Work {
  return {
    id,
    title,
    accountId: "zhihu-1",
    status: "done",
    brief: "",
    source: { kind: "none" },
    workflowId: "general-write",
    step: 3,
    feedbackHistory: [],
    order: 1,
    createdAt: now,
    updatedAt: now,
    tags: [],
    log: [],
  }
}

// relatedWorkIds 只读 id 和 title，测试里用这个函数拼列表
function titledWorks(items: [id: string, title: string][]): Work[] {
  return items.map(([id, title]) => makeWork(id, title))
}

describe("标题对题", () => {
  it("titleKey 去掉末尾「 - 知乎」、标点、空白，转小写", () => {
    expect(titleKey("如何学习编程 - 知乎")).toBe("如何学习编程")
    expect(titleKey("如何学习编程-知乎")).toBe("如何学习编程")
    expect(titleKey("如何学习编程 — 知乎")).toBe("如何学习编程")
    expect(titleKey("How to Learn Programming - 知乎")).toBe("howtolearnprogramming")
    expect(titleKey("Claude Code、Cursor，怎么选？")).toBe("claudecodecursor怎么选")
    expect(titleKey("「黑苹果」装机指南（2026 版）")).toBe("黑苹果装机指南2026版")
    expect(titleKey("全角空格　和\t换行\n")).toBe("全角空格和换行")
    expect(titleKey("引号“里程碑”的写法")).toBe("引号里程碑的写法")
    expect(titleKey("$100 与 ￥1000")).toBe("100与1000")
    expect(titleKey("$ - ￥ - ！")).toBe("")
    expect(titleKey("  ")).toBe("")
    // 只去掉末尾的后缀，中间的知乎二字留着
    expect(titleKey("知乎上怎么学编程 - 知乎")).toBe("知乎上怎么学编程")
  })

  it("titleKey 保留 + 和 #，C++、C#、F# 这类名字不互相碰撞", () => {
    expect(titleKey("C++ 如何管理内存？")).toBe("c++如何管理内存")
    expect(titleKey("C 如何管理内存？")).toBe("c如何管理内存")
    expect(titleKey("F# 和 C++、C#")).toBe("f#和c++c#")
    expect(titleKey("如何学习 C#？")).toBe("如何学习c#")
    // 碰撞回归：去掉 ++ 或 # 的语言名就跟另一个语言撞了
    expect(titleKey("C++ 如何管理内存？")).not.toBe(titleKey("C 如何管理内存？"))
    // 标点和空白不影响：有空格没空格、有没有问号都算同一个键
    expect(titleKey("如何学习 C#？")).toBe(titleKey("如何学习C#"))
  })

  it("relatedWorkIds 按切词和阈值算相关作品，最多 3 个", () => {
    // 切词：汉字相邻两字（黑苹/苹果/果装/装机/机指/指南），英文数字连续算一个词
    const works = titledWorks([
      ["b-1", "黑苹果装机指南 2026"], // 8 词（多一个 2026），交集 8，比例 1
      ["b-2", "黑苹果硬件清单"], // 6 词，交集 2（黑苹/苹果），比例 1/3
      ["b-3", "如何写周报"], // 无交集
      ["b-4", "黑苹果装机指南（补充）"], // 7 词，交集 6，比例 6/7
      ["b-5", "纯标点！？……"], // 切完没词
    ])
    expect(relatedWorkIds("黑苹果装机指南 2026 - 知乎", works)).toEqual(["b-1", "b-4", "b-2"])
    // b-2 全对上（比例 1）；b-1、b-4 只对上黑苹/苹果两个词（2/6）
    expect(relatedWorkIds("黑苹果硬件清单", works)).toEqual(["b-2", "b-1", "b-4"])
    expect(relatedWorkIds("如何写周报", works)).toEqual(["b-3"])
    expect(relatedWorkIds("别的话题", works)).toEqual([])
    // 交集只有 1 个词（苹果），不够至少 2 个
    expect(relatedWorkIds("苹果手机推荐", works)).toEqual([])
    // 标点和后缀不影响切词
    expect(relatedWorkIds("黑苹果装机指南！？（好用的） - 知乎", works)).toEqual(["b-1", "b-4", "b-2"])

    // 阈值：交集 1 个词不够；交集 2 个词但比例低于 0.2 也不算。
    // 用 18 字的长查询：2/16 = 0.125 不够，2/10 = 0.2 刚好够
    const longTitle = "黑苹果装机指南大全教程分享心得体会笔记"
    const threshold = titledWorks([
      ["w-1", "苹果"], // 只有 1 个词「苹果」，交集最多 1
      ["w-2", "黑苹 果装"], // 2 个词，交集 2，比例 1
      ["w-3", "苹果和指南针和许多别的话题凑字数用"], // 16 个词，交集 2，2/16 < 0.2，不算
      ["w-4", "苹果指南中间插别的话题"], // 10 个词，交集 2，2/10 = 0.2 刚好够
    ])
    expect(relatedWorkIds(longTitle, threshold)).toEqual(["w-2", "w-4"])

    // 单字符英文词不算词，两字符以上才算（x y z 切完只剩 xyz，和谁都对不上）
    const abc = titledWorks([
      ["w-1", "AI 编程助手"],
      ["w-2", "Cursor 编程助手"],
      ["w-3", "x y z"],
    ])
    // w-1 全对上（3/3）；w-2 对上编程/程助/助手（3/4）；w-3 切完只剩 xyz，交集 0
    expect(relatedWorkIds("AI 编程助手", abc)).toEqual(["w-1", "w-2"])
    expect(relatedWorkIds("Cursor 编程助手", abc)).toEqual(["w-2", "w-1"])
    expect(relatedWorkIds("黑苹果 Mac 装机指南", abc)).toEqual([])
  })

  it("relatedWorkIds 按相似度从高到低，再按作品编号，最多 3 个（limit 可调）", () => {
    // 都和「黑苹果装机指南」（6 词）相关：w-9 比例 1；w-4、w-5 比例 4/6；w-1 比例 2/6
    const works = titledWorks([
      ["w-9", "黑苹果装机"], // 4 词，交集 4，相似度 1
      ["w-4", "黑苹果装机配置"], // 6 词，交集 4，相似度 4/6
      ["w-5", "黑苹果装机参数"], // 6 词，交集 4，相似度 4/6，同分靠后（编号大）
      ["w-1", "黑苹果硬件指南"], // 6 词，交集 2，相似度 2/6
      ["w-8", "和标题无关"],
    ])
    expect(relatedWorkIds("黑苹果装机指南", works)).toEqual(["w-9", "w-4", "w-5"])
    expect(relatedWorkIds("黑苹果装机指南", works, 2)).toEqual(["w-9", "w-4"])
    // 按去重后的词集合算：「哈哈哈哈」只剩一个词「哈哈」，交集最多 1 个词，和「哈哈」不算相关
    expect(relatedWorkIds("哈哈哈哈", titledWorks([["w-1", "哈哈"]]))).toEqual([])
    expect(relatedWorkIds("哈哈", titledWorks([["w-1", "哈哈哈哈"]]))).toEqual([])
  })

  it("relatedWorkIds 去掉通用词再算：「有哪些」「推荐」不再拉关联", () => {
    // 切词后两边只剩各自的话题词，交集 0
    expect(relatedWorkIds("有哪些心理学入门的书推荐？", titledWorks([["b-1", "有哪些值得长期持有的指数基金推荐？"]]))).toEqual([])
    // 通用词去掉了，剩下的实词（claudecode 等）还足够把这两条对上
    expect(
      relatedWorkIds("如何让claude code自由选择不同的大模型？", titledWorks([["b-2", "claude code里面使用chatgpt的模型教程"]])),
    ).toEqual(["b-2"])
    // 通用词都是双字词，和切词的粒度一致：「有哪些」切出来是「有哪」「哪些」两个，都在集合里
    expect(GENERIC_BIGRAMS.has("有哪")).toBe(true)
    expect(GENERIC_BIGRAMS.has("哪些")).toBe(true)
    expect(GENERIC_BIGRAMS.has("推荐")).toBe(true)
    expect(GENERIC_BIGRAMS.has("如何")).toBe(true)
    expect(GENERIC_BIGRAMS.size).toBe(44)
  })

  it("primaryVia 取权重最高的，空数组给 undefined", () => {
    expect(primaryVia(["personal"])).toBe("personal")
    expect(primaryVia(["hot"])).toBe("hot")
    // 多种时按权重，不按顺序
    expect(primaryVia(["personal", "hot"])).toBe("personal")
    expect(primaryVia(["hot", "blog"])).toBe("blog")
    expect(primaryVia(["hot", "personal", "topic", "blog"])).toBe("blog")
    expect(primaryVia(["topic", "personal"])).toBe("topic")
    expect(primaryVia([])).toBeUndefined()
  })

  it("pickQuestions 四组轮流各取一个，组内按 score 从高到低、再按输入先后", () => {
    const items = [
      pickable("p-1", ["personal"], 15),
      pickable("p-2", ["personal"], 25),
      pickable("t-1", ["topic"], 20),
      pickable("b-1", ["blog"], 30),
      pickable("b-2", ["blog"], 35),
      pickable("h-1", ["hot"], 10),
    ]
    // 第一轮 personal、topic、blog、hot 各一个（组内取分数高的），第二轮接着取剩下的
    expect(pickQuestions(items, 6).map((item) => item.id)).toEqual(["p-2", "t-1", "b-2", "h-1", "p-1", "b-1"])
    // limit 小时只取前几个（还是轮流顺序）
    expect(pickQuestions(items, 3).map((item) => item.id)).toEqual(["p-2", "t-1", "b-2"])
    // 某组取完就跳过：topic 和 hot 只有一个，第二轮只剩 personal 和 blog
    expect(pickQuestions(items, 5).map((item) => item.id)).toEqual(["p-2", "t-1", "b-2", "h-1", "p-1"])
    // limit 小于组数：前面的组先出
    expect(pickQuestions(items, 1).map((item) => item.id)).toEqual(["p-2"])
    expect(pickQuestions(items, 0)).toEqual([])
    // 组内同分按输入先后
    const tied = [pickable("p-a", ["personal"], 15), pickable("p-b", ["personal"], 15)]
    expect(pickQuestions(tied, 2).map((item) => item.id)).toEqual(["p-a", "p-b"])
  })

  it("pickQuestions 某组为空直接跳过，via 为空的排在四组之后，全取完就停", () => {
    // 没有个人化推荐时，第一轮从 topic 开始
    const noPersonal = [pickable("t-1", ["topic"], 20), pickable("b-1", ["blog"], 30)]
    expect(pickQuestions(noPersonal, 2).map((item) => item.id)).toEqual(["t-1", "b-1"])
    // via 为空的排在 hot 之后
    const withEmpty = [pickable("n-1", [], 99), pickable("h-1", ["hot"], 10), pickable("t-1", ["topic"], 20)]
    expect(pickQuestions(withEmpty, 3).map((item) => item.id)).toEqual(["t-1", "h-1", "n-1"])
    // 全部取完就停，不多转空轮
    expect(pickQuestions(withEmpty, 99).map((item) => item.id)).toEqual(["t-1", "h-1", "n-1"])
    expect(pickQuestions([], 5)).toEqual([])
    // via 有多种时按最高权重归组：[blog, hot] 归 blog
    const multi = [pickable("m-1", ["blog", "hot"], 30), pickable("p-1", ["personal"], 15), pickable("h-1", ["hot"], 10)]
    expect(pickQuestions(multi, 3).map((item) => item.id)).toEqual(["p-1", "m-1", "h-1"])
  })
})

describe("ISO 周", () => {
  it("isoWeek 周一开始，跨年按 ISO 规则", () => {
    expect(isoWeek("2026-10-19")).toBe("2026-W43") // 周一
    expect(isoWeek("2026-10-18")).toBe("2026-W42") // 周日
    expect(isoWeek("2026-12-31")).toBe("2026-W53") // 周四，属于 2026 年最后一周
    expect(isoWeek("2027-01-01")).toBe("2026-W53") // 周五，还在 2026-W53
    expect(isoWeek("2027-01-03")).toBe("2026-W53") // 周日
    expect(isoWeek("2027-01-04")).toBe("2027-W01") // 周一，新一年的第一周
    expect(isoWeek("2026-01-01")).toBe("2026-W01") // 周四，1 月 4 日必在第一周
    expect(isoWeek("2025-12-29")).toBe("2026-W01") // 周一，这一周的周四在 2026 年
    expect(isoWeek("2020-12-31")).toBe("2020-W53") // 2020 年也有 53 周
    expect(isoWeek("2021-01-01")).toBe("2020-W53")
    expect(isoWeek("2028-01-01")).toBe("2027-W52") // 2028-01-01 是周六，属于 2027 年的最后一周
  })
})

describe("候选挡不挡", () => {
  const blockedAt = "2026-10-05T09:00:00+08:00"
  const blocked = (state: CandidateState) => candidate("c-1", { state, updatedAt: blockedAt })

  it("四种状态：new 不挡，suggested 和 rejected 永远挡，skipped 冷却内挡", () => {
    expect(isBlocked(undefined, now)).toBe(false)
    expect(isBlocked(blocked("new"), now)).toBe(false)
    expect(isBlocked(blocked("suggested"), now)).toBe(true)
    expect(isBlocked(blocked("rejected"), now)).toBe(true)
    // 刚跳过和 13 天后：挡
    expect(isBlocked(blocked("skipped"), blockedAt)).toBe(true)
    expect(isBlocked(blocked("skipped"), "2026-10-18T09:00:00+08:00")).toBe(true)
    // 2026-10-05 + 14 天 = 2026-10-19：刚好 14 天算过了冷却
    expect(isBlocked(blocked("skipped"), now)).toBe(false)
    // 隔天再确认
    expect(isBlocked(blocked("skipped"), "2026-10-20T09:00:00+08:00")).toBe(false)
  })

  it("冷却按本地日历日算，不看时刻", () => {
    // 10-18 是第 13 天，一整天都在冷却期内（哪怕到了夜里）
    expect(isBlocked(blocked("skipped"), "2026-10-18T23:59:59+08:00")).toBe(true)
    // 10-19 是第 14 天，一整天都算过了冷却（哪怕刚过零点）
    expect(isBlocked(blocked("skipped"), "2026-10-19T00:00:01+08:00")).toBe(false)
  })
})

describe("打分", () => {
  it("scoreQuestion：最高找法 + 每多一种加 5 + 有相关作品加 10", () => {
    expect(scoreQuestion({ via: ["personal"], relatedWorkIds: [] })).toBe(15)
    expect(scoreQuestion({ via: ["hot"], relatedWorkIds: [] })).toBe(10)
    expect(scoreQuestion({ via: ["personal", "hot"], relatedWorkIds: [] })).toBe(15 + 5)
    expect(scoreQuestion({ via: ["personal", "hot", "topic"], relatedWorkIds: [] })).toBe(20 + 10)
    expect(scoreQuestion({ via: ["blog"], relatedWorkIds: [] })).toBe(30)
    expect(scoreQuestion({ via: ["personal"], relatedWorkIds: ["b-1"] })).toBe(15 + 10)
    // 同一个问题被博客反找和热榜同时命中，还和自己的作品对得上
    expect(scoreQuestion({ via: ["blog", "hot"], relatedWorkIds: ["b-1", "b-2"] })).toBe(30 + 5 + 10)
    // 权重取最高的那个：冷门找法不拉低
    expect(scoreQuestion({ via: ["hot", "blog"], relatedWorkIds: [] })).toBe(30 + 5)
    expect(scoreQuestion({ via: [], relatedWorkIds: [] })).toBe(0)
  })

  it("scoreFollowup：增长为主，累计除以一百万", () => {
    expect(scoreFollowup({ kind: "followup", workId: "z-1", platform: "zhihu", reach: 1_200_000, growth: 12, interactions: 5 })).toBe(13.2)
    expect(scoreFollowup({ kind: "followup", workId: "b-1", platform: "blog", reach: 500_000, growth: 3, interactions: null })).toBe(3.5)
    expect(scoreFollowup({ kind: "followup", workId: "z-2", platform: "zhihu", reach: 900, growth: 0, interactions: 0 })).toBe(0.0009)
    // 增长 1 就压过百万级累计：累计只用来分先后
    expect(scoreFollowup({ kind: "followup", workId: "z-3", platform: "zhihu", reach: 2_000_000, growth: 1, interactions: 0 })).toBe(3)
    expect(scoreFollowup({ kind: "followup", workId: "z-4", platform: "zhihu", reach: 0, growth: 0, interactions: 0 })).toBe(0)
  })

  it("scoreDevlog：提交 + 进度流水 × 3", () => {
    const payload = (commits: number, logs: number) => ({
      kind: "devlog" as const,
      repo: "LeafPress",
      path: "C:\\code\\LeafPress",
      week: "2026-W43",
      commits: Array.from({ length: commits }, (_, i) => `提交 ${i}`),
      logs: Array.from({ length: logs }, (_, i) => ({ file: `2026-10-1${i}.md`, headings: ["做了什么"] })),
    })
    expect(scoreDevlog(payload(0, 0))).toBe(0)
    expect(scoreDevlog(payload(7, 0))).toBe(7)
    expect(scoreDevlog(payload(7, 2))).toBe(13)
    expect(scoreDevlog(payload(1, 3))).toBe(10)
    expect(scoreDevlog(payload(30, 10))).toBe(60)
  })
})

describe("候选池", () => {
  it("trimPool 问题按轮流规则保留，续写和开发记录按分数，非 new 的不参与", () => {
    // 问题 22 个：热榜分最高（真实数据里热榜分高但话题杂，轮流取保证各找法都有代表）
    const pool: IdeaCandidate[] = []
    for (let i = 1; i <= 22; i++) {
      // hot 组分数最高、topic 其次、blog 最低：纯按分会全取 hot
      const via: QuestionVia[] = i <= 12 ? ["hot"] : i <= 18 ? ["topic"] : ["blog"]
      pool.push(candidate(`c-q${i}`, { kind: "question", key: `zq:${i}`, score: 100 - i, payload: questionPayload(via) }))
    }
    // 前 12 个是 hot、13～18 是 topic、19～22 是 blog，分数递减：纯按分会全取 hot
    const questions = pool.filter((c) => c.kind === "question")
    const expectedOrder = [
      // 第一轮：personal、topic、blog、hot 的顺序轮流（这里没有 personal），组内取分数最高的
      "c-q13",
      "c-q19",
      "c-q1",
      // 后面轮流：hot 还有 11 个、topic 5 个、blog 3 个，hot 最多多取
      "c-q14",
      "c-q20",
      "c-q2",
      "c-q15",
      "c-q21",
      "c-q3",
      "c-q16",
      "c-q22",
      "c-q4",
      "c-q17",
      "c-q5",
      "c-q18",
      "c-q6",
      "c-q7",
      "c-q8",
      "c-q9",
      "c-q10",
    ]
    expect(
      pickQuestions(
        questions.flatMap((c) => (c.payload.kind === "question" ? [{ id: c.id, via: c.payload.via, score: c.score }] : [])),
        20,
      ).map((i) => i.id),
    ).toEqual(expectedOrder)
    // 续写 5 个（上限 3）、开发记录 3 个；非 new 的混在里面不参与
    for (let i = 1; i <= 5; i++)
      pool.push(candidate(`c-f${i}`, { kind: "followup", key: `wf:${i}`, score: 60 - i, payload: followupPayload() }))
    for (let i = 1; i <= 3; i++)
      pool.push(candidate(`c-d${i}`, { kind: "devlog", key: `dev:c:/code/p${i}:2026-W43`, score: 3 * i, payload: devlogPayload() }))
    pool.push(candidate("c-old", { kind: "question", key: "zq:999", score: 999, state: "suggested", payload: questionPayload(["blog"]) }))
    pool.push(candidate("c-skip", { kind: "followup", key: "wf:998", score: 999, state: "skipped", payload: followupPayload() }))

    const { keep, overflow } = trimPool(pool)
    expect(keep).toHaveLength(20 + 3 + 3)
    // keep 里问题的顺序就是轮流取的顺序
    expect(keep.filter((c) => c.kind === "question").map((c) => c.id)).toEqual(expectedOrder)
    // 挤出去的是 hot 组里分数最低的两个（轮流取到后面只剩 hot 还有剩）
    expect(overflow.map((c) => c.id)).toEqual(["c-q11", "c-q12", "c-f4", "c-f5"])
    expect(keep.filter((c) => c.kind === "followup").map((c) => c.id)).toEqual(["c-f1", "c-f2", "c-f3"])
    expect(keep.filter((c) => c.kind === "devlog").map((c) => c.id)).toEqual(["c-d3", "c-d2", "c-d1"])
    expect([...keep, ...overflow].filter((c) => c.id === "c-old" || c.id === "c-skip")).toEqual([])
  })

  it("trimPool 问题不多时全保留，续写照旧按 updatedAt、id 分先后", () => {
    // 全是 personal 一组：组内按 score，同分按输入先后（pickQuestions 不看 updatedAt 和 id）
    const pool = [
      candidate("c-1", { score: 10, updatedAt: "2026-10-18T09:00:00+08:00" }),
      candidate("c-2", { score: 10, updatedAt: "2026-10-19T09:00:00+08:00" }),
      candidate("c-3", { score: 10, updatedAt: "2026-10-19T09:00:00+08:00" }),
      candidate("c-4", { score: 20 }),
      candidate("c-f1", { kind: "followup", key: "wf:1", score: 5, payload: followupPayload(), updatedAt: "2026-10-18T09:00:00+08:00" }),
      candidate("c-f2", { kind: "followup", key: "wf:2", score: 5, payload: followupPayload() }),
    ]
    const { keep, overflow } = trimPool(pool)
    // 问题：分数高的在前，同分按输入先后；续写：score 同分时 updatedAt 新的在前
    expect(keep.map((item) => item.id)).toEqual(["c-4", "c-1", "c-2", "c-3", "c-f2", "c-f1"])
    expect(overflow).toEqual([])
  })

  it("sortCandidates 类按问题、续写、开发记录，类里按分数从高到低再按 id", () => {
    const payload = (kind: IdeaCandidate["kind"]): IdeaCandidate["payload"] =>
      kind === "devlog"
        ? { kind: "devlog", repo: "r", path: "C:\\code\\r", week: "2026-W43", commits: [], logs: [] }
        : kind === "followup"
          ? { kind: "followup", workId: "z-1", platform: "zhihu", reach: 0, growth: 0, interactions: 0 }
          : { kind: "question", questionId: "1", via: ["personal"], topics: [], blogWorkIds: [], answerSummaries: [], relatedWorkIds: [] }
    const list = [
      candidate("c-d1", { kind: "devlog", score: 9, payload: payload("devlog") }),
      candidate("c-f1", { kind: "followup", score: 2, payload: payload("followup") }),
      candidate("c-q2", { kind: "question", score: 15 }),
      candidate("c-q1", { kind: "question", score: 30 }),
      candidate("c-f2", { kind: "followup", score: 7, payload: payload("followup") }),
      candidate("c-q3", { kind: "question", score: 15 }),
      candidate("c-d2", { kind: "devlog", score: 4, payload: payload("devlog") }),
    ]
    expect(sortCandidates(list).map((item) => item.id)).toEqual(["c-q1", "c-q2", "c-q3", "c-f2", "c-f1", "c-d1", "c-d2"])
    // 不改原数组
    expect(list[0]!.id).toBe("c-d1")
    expect(sortCandidates([])).toEqual([])
  })
})
