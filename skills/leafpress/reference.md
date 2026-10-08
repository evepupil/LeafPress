# LeafPress 命令速查

以下示例均用 `--json`。成功响应外层为 `{ "ok": true, ... }`；失败为 `{ "ok": false, "error": { "code", "message", "hint?" } }`。账号编号示例写作 `<平台编号>-<序号>`，如 `zhihu-1`、`blog-2`；实际操作一律使用命令返回的编号。

| 命令路径        | 用法                                                                                 | JSON 返回里取什么                                                                                               |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `init`          | `leafpress init --json`                                                              | `home`、`configFile`、`dbFile` 和 `migration`，确认初始化位置与记录库版本。                                     |
| `doctor`        | `leafpress doctor --json`                                                            | `checks` 中每项的状态和说明；体检不负责修复。                                                                   |
| `serve`         | `leafpress serve [--port <端口>] [--open] [--dev] --json`                            | `url`；服务启动后进程持续运行。                                                                                 |
| `works`         | `leafpress works [--status <todo,doing,waiting,done>] [--account <账号编号>] --json` | `works`；`todo` 项按队列顺序，第一项编号在 `works[0].id`。                                                      |
| `work show`     | `leafpress work show <作品编号> --json`                                              | `detail.context` 是完整作品说明；`detail.work` 是当前状态。                                                     |
| `work next`     | `leafpress work next [--account <账号编号>] --json`                                  | `lease.token` 用于后续推进；完整说明读 `detail.context`。无可接作品时 `detail` 为 `null`。                      |
| `work start`    | `leafpress work start <作品编号> [--force] --json`                                   | `lease.token` 和 `detail.context`；`--force` 用于明确接管已有租约。                                             |
| `work step`     | `leafpress work step <作品编号> --lease <令牌> [--force] --json`                     | `message`、`detail.context`；停在等作者处理时从上下文取原文转告作者。                                           |
| `work run`      | `leafpress work run <作品编号> --lease <令牌> --json`                                | `message`、`outcome.kind` 和 `detail.context`；`outcome.kind` 为 `fail` 时报告原因并停下。                      |
| `work back`     | `leafpress work back <作品编号> <步骤序号> --lease <令牌> --json`                    | `message` 和 `detail.context`；步骤序号从 1 开始。                                                              |
| `work release`  | `leafpress work release <作品编号> --lease <令牌> --json`                            | `work`；作品交还到待实现队列。                                                                                  |
| `work feedback` | `leafpress work feedback <作品编号> <反馈文字> --json`                               | `work`；提交作者反馈后再接手作品。                                                                              |
| `work new`      | `leafpress work new --account <账号编号,…> --title <标题> [--brief <要求>] --json`   | `works` 中每个新作品的 `id`。                                                                                   |
| `convert`       | `leafpress convert <灵感编号或作品编号> --to <账号编号,…> [--brief <要求>] --json`   | `works` 中新作品的 `id`；灵感编号以 `i-` 开头。                                                                 |
| `ideas`         | `leafpress ideas [--status <inbox,promising,converted>] --json`                      | `ideas`，每项含灵感编号、状态和内容。                                                                           |
| `ideas add`     | `leafpress ideas add <一句话> --json`；批量：`leafpress ideas add --stdin --json`    | `ideas[].id`；批量标准输入是 JSON 数组，每项必填 `text`，可选 `detail`、`accountId`、`source`、`sourceDetail`。 |
| `accounts`      | `leafpress accounts --json`                                                          | `accounts`，核对账号编号、平台和档案状态。                                                                      |
| `account show`  | `leafpress account show <账号编号> --json`                                           | `account` 和 `setup`；查看档案全文及接入状态。                                                                  |
| `account add`   | `leafpress account add --platform <平台> --name <名称> [--intro <一句话>] --json`    | `account.id` 是后续命令使用的账号编号。                                                                         |
| `data pull`     | `leafpress data pull [--account <账号编号,…>] --json`                                | `outcomes` 和 `note`；失败或缺配置时按返回说明处理。                                                            |
| `export`        | `leafpress export --json`                                                            | `dir`，即备份导出目录。                                                                                         |
| `skill install` | `leafpress skill install [--force] --json`                                           | `targets` 中每个安装路径及 `action`；覆盖时才加 `--force`。                                                     |
