import {
  progressText,
  workflowById,
  WORK_STATUS_LABEL,
  type WorkStatus,
} from "@leafpress/core";
import type { CliContext } from "../context.js";
import { renderTable, tableCell } from "../output.js";
import { commandOptions, emitSuccess, enumValues } from "./shared.js";

const WORK_STATUSES: readonly WorkStatus[] = [
  "todo",
  "doing",
  "waiting",
  "done",
];

export async function executeWorks(
  context: CliContext,
  options: { status?: string; account?: string },
) {
  const status = enumValues(options.status, WORK_STATUSES, "作品状态");
  const usecases = await context.getUseCases();
  const works = usecases.listWorks({
    ...(status === undefined ? {} : { status }),
    ...(options.account === undefined ? {} : { accountId: options.account }),
  });
  const accounts = new Map(
    usecases.listAccounts().map((account) => [account.id, account.name]),
  );
  return { works, accounts };
}

export function renderWorks(
  result: Awaited<ReturnType<typeof executeWorks>>,
): string {
  if (result.works.length === 0) return "没有作品";
  const groups: string[] = [];
  for (const status of WORK_STATUSES) {
    const items = result.works.filter((work) => work.status === status);
    if (items.length === 0) continue;
    const rows = items.map((work) => {
      const account = result.accounts.get(work.accountId) ?? work.accountId;
      const workflow = workflowById(work.workflowId);
      return [
        tableCell(work.id, 18),
        tableCell(account, 24),
        tableCell(work.title, 40),
        tableCell(
          workflow === undefined ? "未知工作流" : progressText(work, workflow),
          40,
        ),
      ];
    });
    groups.push(
      `${WORK_STATUS_LABEL[status]}（${items.length}）\n${renderTable(["编号", "账号", "标题", "进度"], rows)}`,
    );
  }
  return groups.join("\n\n");
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const result = await executeWorks(context, {
    ...(typeof options["status"] === "string"
      ? { status: options["status"] }
      : {}),
    ...(typeof options["account"] === "string"
      ? { account: options["account"] }
      : {}),
  });
  emitSuccess(context, { works: result.works }, renderWorks(result));
}
