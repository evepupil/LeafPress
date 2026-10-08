---
name: leafpress
description: "作者提到 LeafPress、作品、待实现、灵感，或说“做一下 z-12”“继续”“我发好了”“看看有哪些待实现的”“把这些记成灵感”时使用。"
---

# LeafPress

用 LeafPress 命令行接手作品、写产出、在该停时停下，并在作者反馈后继续。不要绕开 LeafPress 自己改作品状态。

## 处理一个作品

1. 作者点名作品时运行 `leafpress work start <编号> --json`；否则运行 `leafpress work next --json`。没有可接作品时，返回的 `detail` 是 `null`，告知作者并停下。
2. 从 JSON 记下 `lease.token`。后续推进都带这个令牌和 `--json`，例如 `leafpress work step <编号> --lease <令牌> --json`、`leafpress work run <编号> --lease <令牌> --json`、`leafpress work back <编号> <步骤序号> --lease <令牌> --json`、`leafpress work release <编号> --lease <令牌> --json`。令牌只用于命令，不贴进稿子或公开内容。
3. 从 `detail.context` 头到尾读完整说明再动手。这里包括要求、步骤、当前要做的事、反馈和账号档案；档案里的写法规矩必须照做。档案没写时，先问作者这个号写给谁、怎么写，不要自行补规矩。
4. AI 步骤按“这一步怎么做”完成产出。文件名须与 `produces` 完全一致，放在任务文件夹（路径在 `detail.folder`）；不要改 LeafPress 管理的文件。完成后运行 `leafpress work step <编号> --lease <令牌> --json`。
5. 自动步骤运行 `leafpress work run <编号> --lease <令牌> --json`。看 JSON 的 `message` 和 `outcome.kind`；`fail` 时把原因告诉作者，不要绕过失败继续。
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

## 记录灵感

作者要批量记灵感时，把 JSON 数组通过标准输入交给 `leafpress ideas add --stdin --json`。每项含 `text`，可选 `detail`、`accountId`、`source`、`sourceDetail`；需要指定账号时用命令返回的账号编号。

## 边界

不要改任务文件夹中的 `作品.md`、`状态.json`、`要你做的事.md`、`你的反馈.md`、`记录.log`，不要直接改记录库，不在输出中贴密钥，也不要替作者发布。稿件及其他步骤产出只写入任务文件夹。

## 示例对话

作者说：“看看有哪些待实现的，挑第一个做。” agent 运行 `leafpress work next --json`（它会挑待实现里排最前、工作流能用的一个并接手），记下令牌，完整阅读 `detail.context` 并按档案写作，把 `produces` 指定的文件写进任务文件夹后运行 `leafpress work step <编号> --lease <令牌> --json`；如果返回要作者发布，就把上下文里的“等作者做的事”原文发给作者并停下，例如：“稿子已准备好，请打开指定文件检查并发布；发布后把链接贴回来，我再继续归档。”
