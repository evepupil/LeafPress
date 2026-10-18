---
name: leafpress
description: "仅在作者明确提到 LeafPress、给出作品编号（如 z-12、b-3），或要处理 LeafPress 里的灵感、作品、数据（包括「跑灵感」）时使用；不要因“作品”“灵感”等泛词单独触发。"
---

# LeafPress

用 LeafPress 命令行接手作品、写产出、在该停时停下，并在作者反馈后继续。不要绕开 LeafPress 自己改作品状态。

## 处理一个作品

1. 作者点名作品时运行 `leafpress work start <编号> --json`；否则运行 `leafpress work next --json`。没有可接作品时，返回的 `detail` 是 `null`，告知作者并停下。
2. 从 JSON 记下 `lease.token`。后续推进都带这个令牌和 `--json`，例如 `leafpress work step <编号> --lease <令牌> --json`、`leafpress work run <编号> --lease <令牌> --json`、`leafpress work back <编号> <步骤序号> --lease <令牌> --json`、`leafpress work release <编号> --lease <令牌> --json`。令牌只用于命令，不贴进稿子或公开内容。
3. 从 `detail.context` 头到尾读完整说明再动手。这里包括要求、步骤、当前要做的事、反馈和账号档案；档案里的写法规矩必须照做。档案没写时，先问作者这个号写给谁、怎么写，不要自行补规矩。
4. AI 步骤按“这一步怎么做”完成产出。文件名须与 `produces` 完全一致，放在任务文件夹（路径在 `detail.folder`）；不要改 LeafPress 管理的文件。完成后运行 `leafpress work step <编号> --lease <令牌> --json`。
5. 自动步骤运行 `leafpress work run <编号> --lease <令牌> --json`。看 JSON 的 `message` 和 `outcome.kind`；按“博客写稿”处理博客步骤，其他失败如实说明，不要绕过失败继续。
6. 如果返回的 `message` 表示“停在等你处理”，从 `detail.context` 的“等作者做的事”取出原文，逐字转告作者，然后停下。不要替作者发布、确认或录屏，也不要在等待时继续跑命令。
7. 作者完成手动步骤并提交反馈后，作者说“好了 / 发了 / 继续”时运行 `leafpress work next --json`；指定作品则运行 `leafpress work start <编号> --json`。如果作者直接在对话里给了反馈、尚未在工作台提交，先运行 `leafpress work feedback <编号> <反馈文字> --json`。重新读取新的 `detail.context`，按反馈继续。需要重做前面的步骤时用 `leafpress work back <编号> <步骤序号> --lease <令牌> --json`；步骤序号从 1 开始。
8. 中途要停时运行 `leafpress work release <编号> --lease <令牌> --json`，交还租约。

账号编号使用 `<平台编号>-<序号>` 格式，例如 `zhihu-1`、`blog-2`。编号始终从命令 JSON 的返回中读取，不按示例猜测或拼造。

## 常见情况

- 令牌不匹配：先运行 `leafpress work show <编号> --json`，查看当前状态再决定；不要重复试旧令牌。
- 对话压缩后令牌丢失：先运行 `leafpress work show <编号> --json` 确认作品，再告知作者将接管，并运行 `leafpress work start <编号> --force --json`。
- 提示缺少产出文件：按 `detail.context` 中列出的文件名写入任务文件夹，再运行 `leafpress work step <编号> --lease <令牌> --json`；只有这一步确实不需要产出时才加 `--force`。
- 提示要先配置工作流或接入：把命令返回的提示原样转告作者，请作者到网页的账号详情“接入”里配置；不要绕过检查。
- `leafpress work step <编号> --lease <令牌> --json`、`leafpress work run <编号> --lease <令牌> --json` 返回要作者处理：照上一节原样转告并停下。作者的反馈在 `detail.context` 的“作者的反馈”里，照着改；反馈之外的事不要自作主张。

## 博客写稿

- 按 `detail.context` 完成工作流。整理素材时产出 `素材.md`；写稿时产出 `中文稿.mdx`、`英文稿.mdx`、`slug.txt`，图片可放 `images/`，正文路径写成 `/images/posts/<slug>/<文件名>`。slug 用小写英文、数字和单个连字符。所有文件只写进 `detail.folder` 任务文件夹。
- Frontmatter 按工作流要求写：中文 `locale: "zh-CN"`，英文 `locale: "en"`；`published: "YYYY-MM-DD"` 带引号且中英文相同；两篇都写 `draft: false`，并保持相同的 `translationKey`（使用 slug）。`title`、240 字以内的 `description`、至少一个 `tags` 也要有。问题复盘类文章可以参照作者的「博客问题复盘」skill，只借它的结构；不要运行它的提交、推送，这两步由 LeafPress 后面的自动步骤做。
- 不要改博客仓库里的文件，不要自己提交或推送；LeafPress 的自动步骤会检查、提交和推送。
- 三个自动步骤可能运行数分钟。调用 `leafpress work run` 时把工具超时设为 10 分钟；若工具超时中断，先运行 `leafpress work show <编号> --json` 看当前步骤，再按状态重跑。自动步骤使用 LeafPress 自己的检出目录，不会改作者的博客工作区。
- 「跑博客检查」没过：读任务文件夹里的 `检查结果.txt`，按结果修稿，然后重跑 `leafpress work run <编号> --lease <令牌> --json`，不用问作者。
- 提示「slug 撞了已有文章」，要改 `slug.txt` 里的 slug。撞的是哪一步，接下来不一样：
  - 在「跑博客检查」撞了，提示是「slug 撞了已有文章：<路径>，改 slug.txt 里的 slug 再跑」：改完直接重跑 `work run`。
  - 在「提交并推送」撞了，提示是「slug 撞了已有文章：<路径>；改 slug.txt 里的 slug，再运行 leafpress work back <编号> 4 重新跑检查」：先照提示运行 `leafpress work back <编号> 4 --lease <令牌> --json` 退回第 4 步「跑博客检查」，改 `slug.txt`，再重跑 `work run`。不退回就改，会被拦下，提示「稿子在检查之后改过」。
  - slug 一改，两篇稿子的 `translationKey`（与 slug 相同，中英文仍要相同）和正文里图片路径 `/images/posts/<slug>/` 中的 slug 也要一起改成新的。
- 提示「博客仓库正在被另一次……使用」时，等一会儿再运行 `work run`。提示「等上线」没等到时，过两三分钟再运行；超过半小时仍未上线，再告诉作者。

## 知乎写稿

知乎三条工作流由 LeafPress 按来源和要求自动配：要求或标题里有知乎问题链接（`zhihu.com/question/…`）→ 回答问题；从博客作品转来 → 博客改写；其余 → 写文章。要换工作流由作者在网页上改。各条工作流的细节见 reference.md。

- 写作规则在账号档案里：先整份读档案，档案里可能只写规则文件的位置，照那份写，交稿前按它的自检清单逐条过一遍。
- 写文章、回答问题要先确认大纲：出完 `大纲.md` / `提纲.md` 就报这一步做完，作品停在「你确认大纲 / 你确认提纲」等作者，把「等作者做的事」原文转告后停下；作者反馈要改就先改大纲，再写全文。博客改写没有确认这一步。
- 稿子格式：文章存 `文章.md`，第一行是 `# 标题`；回答存 `回答.md`，不写标题，第一行就是正文；流程图用 mermaid 代码块；图片照博客原来的写法，或放进任务文件夹。
- 复制页由「生成复制页」代码步骤自动生成，不自己写 HTML；作品随后停在「你去发布 / 你去回答」，作者发完贴回链接，「归档链接」会认知乎的文章、回答链接。
- 知乎要配开放平台密钥才拉得到数据、导得进已发内容。帮作者配用 `leafpress account set <账号> access-secret --stdin`，密钥从标准输入读，不写进命令行；已发的文章、回答用 `leafpress account import <知乎账号> --json` 导入为作品。

## 小红书图文卡片

小红书作品自动配「图文卡片」工作流：agent 只写两份稿子 `卡片.md`、`文案.md`；出图、预览页由「排版卡片」自动步骤做，不自己写 HTML、不自己截图。格式和字数限制见 reference.md。

- 卡片稿：封面一张、要点 4～8 张、总结一张；页与页之间用单独一行 `---` 分开，各处字数上限照 reference.md 的规格。
- 文案：第一行 `# 标题`（20 字以内）；正文 1000 字以内，不放链接；最后一行 3～8 个话题标签（`#话题` 用空格分开）。
- 「排版卡片」失败时会逐条列出不合格的地方：照着改两份稿子，再运行一次 `leafpress work run <编号> --lease <令牌> --json`。
- 之后作品停在「你在手机上发」：把「等作者做的事」原文转告后停下。作者发完贴回分享链接或整段分享文字，「归档链接」认长链和 `xhslink.com` 短链。

## 查数据

作者要分析数据时，先按需运行 `leafpress data pull --json` 拉一次，再用命令返回的数据分析：`leafpress data show --json` 看账号概况、走势和作品排行；`leafpress report --json [--week <周一的日期>]` 看周报和复盘。参数的取值范围和缺省值见 reference.md。拉取失败就说明实际结果，不要编造数据。

- 第一次 `data pull` 要补半年历史（博客的 Umami 数据），可能拉几分钟，进度打到标准错误。调用 `leafpress data pull` 时把工具超时设为至少 10 分钟。
- 知乎数据走开放平台，每天最多用 90 次额度，一天只拉一次；`data pull` 返回「已是最新」属正常，不要当失败反复重试。
- 读 JSON 先分清「没有」和「0」，不要把补出来的 0 当成真实的 0：粉丝和粉丝增减是 `null`，表示这个平台拿不到（博客拿不到订阅数），不是 0 个订阅；账号的 `hasData` 为 false 表示还没拉到过它的数据，它的浏览、互动是补出来的 0，只有发布篇数是真的；`dataThrough` 是记录库里账号最后一次有数的日期，比 `latestDay` 早，说明最近几天没拉到，那几天的 0 不是下滑。
- `report` 不填 `--week` 看的是昨天所在的那一周，这一周可能还没过完（`report.complete` 为 false，数据只到 `report.end`，人看的输出标题里写「到 X」）。要看上一整周，用 `--week <上周一>`。

## 记录灵感

作者要批量记灵感时，把 JSON 数组通过标准输入交给 `leafpress ideas add --stdin --json`。每项含 `text`，可选 `detail`、`accountId`、`source`、`sourceDetail`；需要指定账号时用命令返回的账号编号。

## 跑灵感

作者说「跑灵感」，或者定时任务让你跑灵感时，照同目录的 ideas.md 做：读知乎账号档案提炼主题词 → `leafpress ideas gather` 找候选 → 挑 5～10 条写清来源、为什么值得写、建议角度、相关作品 → `leafpress ideas add --stdin` 交 → `leafpress ideas skip <看过没挑的编号>` 收尾。

## 边界

不要改任务文件夹中的 `作品.md`、`状态.json`、`要你做的事.md`、`你的反馈.md`、`记录.log`，不要直接改记录库，不在输出中贴密钥，也不要替作者发布。稿件及其他步骤产出只写入任务文件夹。

## 示例对话

作者说：“看看有哪些待实现的，挑第一个做。” agent 运行 `leafpress work next --json`（它会挑待实现里排最前、工作流能用的一个并接手），记下令牌，完整阅读 `detail.context` 并按档案写作，把 `produces` 指定的文件写进任务文件夹后运行 `leafpress work step <编号> --lease <令牌> --json`；如果返回要作者发布，就把上下文里的“等作者做的事”原文发给作者并停下，例如：“稿子已准备好，请打开指定文件检查并发布；发布后把链接贴回来，我再继续归档。”
