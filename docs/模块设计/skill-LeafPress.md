# skill · LeafPress

> 模块定位：教 agent（Claude Code、Codex）用 LeafPress 命令行接手作品、按工作流做、该停就停、读反馈接着做 · 对应代码：`skills/leafpress/`（`leafpress skill install` 装到用户的 skill 目录） · 所属里程碑：[M1 底座](../roadmap.md#m1-底座)、[M2 博客](../roadmap.md#m2-博客)（博客写稿、查数据） · 状态：已完成 · 最近更新：2026-10-09

## 职责与边界

- 管：agent 什么时候用这个 skill；一个作品从接手到做完的固定做法；每类步骤怎么处理；常见状况（令牌丢了、作品被挪走、要的文件没写）怎么办；批量加灵感；什么不能做。
- 不管：命令本身（见 [命令行](命令行-入口与命令.md)）；各平台的写作规矩（在账号档案和平台自己的 skill 里，比如知乎写作 skill）。

## 结构

```
skills/leafpress/
├── SKILL.md          主文件：触发说明 + 做法，控制在 150 行以内
└── reference.md      命令速查：每个命令一行用法和一句说明，`--json` 的返回形状
```

### SKILL.md 必须写清的事

1. **什么时候用**（frontmatter 的 description，M2 收窄）：仅在作者明确提到 LeafPress、给出作品编号（如 z-12、b-3），或要处理 LeafPress 里的灵感、作品、数据时使用；不要因「作品」「灵感」等泛词单独触发。
2. **一个作品的做法**：
   - 接手：`leafpress work next --json`（或作者点名时 `work start <编号> --json`），记下返回的令牌 `lease.token`，之后推进这个作品的命令都带 `--lease <令牌>`。
   - 读上下文：返回里的 `detail.context` 就是完整说明（要求、步骤、要你做的事、作者的反馈、账号档案）；动手前从头到尾读一遍，**账号档案里的写法规矩必须照做**。
   - AI 步骤：按「这一步怎么做」写产出，文件名和 `produces` 一字不差，放进任务文件夹；写完 `leafpress work step <编号> --lease <令牌>`。
   - 代码步骤：`leafpress work run <编号> --lease <令牌>`；出错时把原因告诉作者，不要自己绕过。
   - 停在等你处理：命令返回「停在等你处理」时，把「要你做的事」原样转告作者，然后停下。**不要替作者做「你来」的步骤**（发布、确认、录屏）。
   - 作者说「好了 / 发了 / 继续」：`work next` 或 `work start <编号>` 接着做；反馈里要改的，先照着改（需要回到前面的步骤时用 `work back`）。
   - 做到一半要停：`leafpress work release <编号> --lease <令牌>`。
3. **常见状况**：
   - 「令牌对不上」：作品被别人接手或被作者挪走了，`work show` 看现在的情况再说。
   - 令牌丢了（对话被压缩）：先 `work show` 确认，再 `work start <编号> --force` 接管（告诉作者一声）。
   - 「这一步要产出 …，任务文件夹里还没有」：把文件写进去再 `work step`；确定这一步不需要产出才用 `--force`。
   - 工作流要先配置：把提示原样告诉作者，让作者在网页的账号详情 · 接入里填。
4. **灵感**：作者说「把这些记下来」时，用 `leafpress ideas add --stdin --json`，从标准输入传 JSON 数组（每条 `text`，可选 `detail`、`accountId`、`source`、`sourceDetail`）。
5. **不能做的事**：不改任务文件夹里的 `作品.md`、`状态.json`、`要你做的事.md`、`你的反馈.md`、`记录.log`（它们由 LeafPress 写）；不直接改记录库；不在任何输出里贴密钥；不替作者发布。
6. **博客写稿的注意事项**（M2 加）：
   - 产出文件：素材时 `素材.md`；写稿时 `中文稿.mdx`、`英文稿.mdx`、`slug.txt`（slug 用小写英文、数字和单个连字符），图片可放 `images/`，正文路径写成 `/images/posts/<slug>/<文件名>`；只写进任务文件夹，不改博客仓库里的文件，不自己提交推送。
   - frontmatter：中文 `locale: "zh-CN"`、英文 `locale: "en"`；`published: "YYYY-MM-DD"` 带引号且中英文相同；两篇都写 `draft: false`，并保持相同的 `translationKey`（用 slug）；`title`、240 字以内的 `description`、至少一个 `tags` 也要有。
   - 问题复盘类文章可以参照作者的「博客问题复盘」skill，**只借它的结构**；不要运行它的提交、推送，这两步由 LeafPress 后面的自动步骤做。
   - 三个自动步骤（跑检查、提交推送、等上线归档）可能运行数分钟：调 `work run` 时把工具超时设为 10 分钟；超时中断后先 `work show` 看当前步骤再按状态重跑。
   - 「跑博客检查」没过：读任务文件夹里的 `检查结果.txt`，按结果修稿后重跑 `work run`，不用问作者。
   - slug 撞了已有文章：改 `slug.txt` 里的 slug，两篇的 `translationKey`（与 slug 相同）和正文里图片路径的 slug 一起改。撞的步骤不同后续不同：在「跑博客检查」撞的，改完直接重跑 `work run`；在「提交并推送」撞的，先 `work back <编号> 4` 退回第 4 步「跑博客检查」再改再跑（不退回就改会被拦下，提示「稿子在检查之后改过」）。
   - 译文配对键（translationKey）撞了已有文章（在「跑博客检查」）：提示「译文配对键 …和已有文章 …撞了：换一个 slug 写进 slug.txt，同时把中英两篇稿子 frontmatter 里的 translationKey 改成新的 slug，再跑」：换 slug 写进 `slug.txt`、两篇的 `translationKey` 和图片路径一起改，重跑 `work run`。
   - 提示「博客仓库正在被另一次……使用」时等一会儿再跑；「等上线」没等到时过两三分钟再跑，超过半小时仍未上线才告诉作者。
7. **查数据、看周报**（M2 加）：作者要分析数据时，先按需 `leafpress data pull --json` 拉一次，再 `leafpress data show --json` 看账号概况、走势和作品排行，`leafpress report --json [--week <周一的日期>]` 看周报和复盘；参数取值和缺省值见 reference.md。拉取失败就说明实际结果，不要编造数据。第一次 `data pull` 要补半年历史（博客的 Umami），可能拉几分钟，进度打到标准错误，调这条命令时把工具超时设为至少 10 分钟。读 JSON 先分清「没有」和「0」：粉丝和粉丝增减是 null 表示这个平台拿不到（博客拿不到订阅数），不是 0 个订阅；`hasData` 为 false 表示还没拉到过这个号的数据，它的浏览、互动是补出来的 0，只有发布篇数是真的；`dataThrough` 是记录库里账号最后一次有数的日期，比 `latestDay` 早说明最近几天没拉到，那几天的 0 不是下滑；`report` 不填 `--week` 看的是昨天所在的那一周，可能还没过完（`complete` 为 false，数据只到 `report.end`），要看上一整周用 `--week <上周一>`。
8. 一段示例对话（作者：「看看有哪些待实现的，挑第一个做」→ agent 的命令序列和该对作者说的话）。

## 关键决策

1. **skill 只讲做法，规矩在档案里**：每个号怎么写由账号档案说了算，skill 不重复平台写法，换号不用改 skill。
2. **令牌明着交给 agent**：skill 要求 agent 记住它；丢了有 `--force` 兜底。
3. **源文件在仓库里，装到用户目录**：改了 skill 重新 `leafpress skill install --force` 就生效，Claude Code 和 Codex 用同一份。

## 当前实现

`SKILL.md`（62 行：接手和推进、常见情况、博客写稿、查数据、记灵感、边界、示例，命令示例一律带 `--json` 并写清从返回里取什么）、`reference.md`（27 条命令速查，多了一节「查数据：JSON 里看什么」：null 表示拿不到、`hasData` 和 `dataThrough` 的意思、走势点的形状、周报的 `complete`、账号和作品只带必要字段）、`tests/skill/reference.test.ts`（速查里每条命令都在 `--help` 里；**每一行写到的每个 `--` 参数都在命令定义里真的存在**，`data show` 和 `report` 两行还要求把命令定义里的参数写全；表格以外的文字里写到的参数也要至少在某条命令里有定义；列出数据分析、周报和定时任务命令，但不暴露 `--scheduled`）。

验收：主控另起一个只读 skill 说明的 agent，在临时数据目录里只说「看看 LeafPress 有哪些待实现的作品，挑第一个做」，它接手、整份读档案、写了符合档案要求的稿子、停在「你去发布」并原文转告要你做的事；网页提交反馈后说「我发好了，继续」，它接着做完并归档链接。

## 验证方式

- 人工过一遍：用一个临时数据目录，在 Claude Code 里只说「看看 LeafPress 有哪些待实现的，挑第一个做」，agent 能按 skill 接手、写稿、停在「你去发布」并把要你做的事转告；网页提交反馈后说「继续」，agent 能归档链接、作品变成已完成。这一条是 M1 的退出标准之一，由主控亲自验收。
- `reference.md` 里的每条命令在 `leafpress --help` 里都存在，写到的每个参数在命令定义里都有（`tests/skill/reference.test.ts` 自动对一遍）。

## 待扩展项

- 以后：MCP 接好后，skill 里改成优先调 MCP 工具。

## 改动历史

| 日期 | 改动 |
|---|---|
| 2026-10-09 | 写出规格 |
| 2026-10-09 | 实现完成；端到端验收通过 |
| 2026-10-09 | M2：触发条件收窄（只在明确提到 LeafPress、给出作品编号、要处理灵感作品数据时）；博客写稿的注意事项（frontmatter、只借「博客问题复盘」skill 的结构、slug 和配对键撞车的处理）；查数据、看周报两条命令和 JSON 里该看的字段；第一次拉数据要补历史、命令超时至少 10 分钟；测试核对每个参数在命令定义里存在 |
