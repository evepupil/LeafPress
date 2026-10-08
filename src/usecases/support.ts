import {
  WORK_STATUS_LABEL,
  currentStep,
  dayOfDate,
  isUsable,
  settingViews,
  taskContext,
  taskState,
  toIsoTime,
  workflowById,
  type Account,
  type Idea,
  type Work,
  type WorkDetail,
  type WorkResult,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import {
  missingFiles,
  taskFolderPath,
  listTaskFiles,
  writeTaskMirror,
  type TaskMirror,
} from "../files/task-folder.js";
import {
  profilePath as accountProfilePath,
  readProfile,
} from "../files/profiles.js";
import { redactSecrets } from "../config/redact.js";
import { withTaskLock } from "../files/lock.js";
import type { AccountRow } from "../store/types.js";
import type { AppContext } from "./context.js";

export function nowParts(app: AppContext): {
  date: Date;
  at: string;
  today: string;
} {
  const date = app.now();
  return { date, at: toIsoTime(date), today: dayOfDate(date) };
}

export function secretValues(app: AppContext, accountId: string): string[] {
  return [...app.credentials.keys(accountId)]
    .map((key) => app.credentials.get(accountId, key))
    .filter(
      (value): value is string => value !== undefined && value.length > 0,
    );
}

export function redactTextWithSecrets(
  app: AppContext,
  accountId: string,
  text: string,
  initialSecrets: readonly string[],
): string {
  return redactSecrets(text, [
    ...initialSecrets,
    ...secretValues(app, accountId),
  ]);
}

export function redactText(
  app: AppContext,
  accountId: string,
  text: string,
): string {
  return redactTextWithSecrets(app, accountId, text, []);
}

function redactUnknown(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redactSecrets(value, secrets);
  if (Array.isArray(value))
    return value.map((item) => redactUnknown(item, secrets));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactUnknown(item, secrets),
      ]),
    );
  }
  return value;
}

export function redactValueWithSecrets<T>(
  app: AppContext,
  accountId: string,
  value: T,
  initialSecrets: readonly string[],
): T {
  return redactUnknown(value, [
    ...initialSecrets,
    ...secretValues(app, accountId),
  ]) as T;
}

export function redactValue<T>(
  app: AppContext,
  accountId: string,
  value: T,
): T {
  return redactValueWithSecrets(app, accountId, value, []);
}

export function redactAllValues<T>(app: AppContext, value: T): T {
  const secrets = app.store.accounts
    .list()
    .flatMap((account) => secretValues(app, account.id));
  return redactUnknown(value, secrets) as T;
}

export function accountFromRow(app: AppContext, row: AccountRow): Account {
  const platform = app.catalog[row.platform];
  const settings = settingViews(platform, {
    values: app.store.settings.values(row.id),
    secrets: app.credentials.keys(row.id),
    expired: app.store.settings.expired(row.id),
  });
  return {
    ...row,
    profile: readProfile(app.paths, row.id),
    profilePath: accountProfilePath(app.paths, row.id),
    settings,
  };
}

export function listAccounts(app: AppContext): Account[] {
  return app.store.accounts.list().map((row) => accountFromRow(app, row));
}

export function getAccount(app: AppContext, id: string): Account | undefined {
  const row = app.store.accounts.get(id);
  return row ? accountFromRow(app, row) : undefined;
}

export function requireAccount(app: AppContext, id: string): Account {
  const account = getAccount(app, id);
  if (!account) throw new LeafPressError("NOT_FOUND", `没有这个账号：${id}`);
  return account;
}

export function requireWork(app: AppContext, id: string): Work {
  const work = app.store.works.get(id);
  if (!work) throw new LeafPressError("NOT_FOUND", `没有这个作品：${id}`);
  return work;
}

export function requireIdea(app: AppContext, id: string): Idea {
  const idea = app.store.ideas.get(id);
  if (!idea) throw new LeafPressError("NOT_FOUND", `没有这条灵感：${id}`);
  return idea;
}

export function workVars(
  app: AppContext,
  work: Work,
  account: Account,
): { folder: string; platform: string; account: string } {
  return {
    folder: taskFolderPath(app.paths, work.id),
    platform: app.catalog[account.platform].name,
    account: account.name,
  };
}

export function workDetail(app: AppContext, input: Work): WorkDetail {
  const account = requireAccount(app, input.accountId);
  const platform = app.catalog[account.platform];
  const workflow = workflowById(input.workflowId);
  if (!workflow)
    throw new LeafPressError("INTERNAL", `找不到工作流：${input.workflowId}`);
  const work = redactValue(app, account.id, input);
  const safeAccount = redactValue(app, account.id, account);
  const folder = taskFolderPath(app.paths, work.id);
  const files = redactValue(app, account.id, listTaskFiles(app.paths, work.id));
  let source:
    | { title: string; url?: string; localPath?: string; folder?: string }
    | undefined;
  if (work.source.kind === "idea") {
    const idea = app.store.ideas.get(work.source.ideaId);
    source = {
      title: redactText(app, account.id, idea?.text ?? "（来源灵感已删除）"),
    };
  } else if (work.source.kind === "work") {
    const sourceWork = app.store.works.get(work.source.workId);
    source = sourceWork
      ? redactValue(app, account.id, {
          title: sourceWork.title,
          ...(sourceWork.url === undefined ? {} : { url: sourceWork.url }),
          ...(sourceWork.localPath === undefined
            ? {}
            : { localPath: sourceWork.localPath }),
          folder: taskFolderPath(app.paths, sourceWork.id),
        })
      : { title: "（来源作品已删除）" };
  }
  const step = currentStep(work, workflow);
  const missing =
    step?.kind === "ai" && step.produces?.length
      ? missingFiles(app.paths, work.id, step.produces)
      : [];
  const context = redactText(
    app,
    account.id,
    taskContext({
      work,
      account: safeAccount,
      platform,
      workflow,
      folder,
      source,
      files,
    }),
  );
  return redactValue(app, account.id, {
    work,
    account: safeAccount,
    platform,
    workflow,
    folder,
    files,
    ...(step === undefined ? {} : { step }),
    missing,
    context,
  });
}

export function unwrapWork(result: WorkResult): Work {
  if (result.ok) return result.work;
  throw new LeafPressError(
    result.code === "INVALID" ? "USAGE" : "STATE_CONFLICT",
    result.reason,
  );
}

export function syncTaskFolder(app: AppContext, workId: string): void {
  try {
    withTaskLock(app.paths, workId, () => {
      const mirror = app.store.transaction((): TaskMirror | undefined => {
        const work = app.store.works.get(workId);
        if (!work) return undefined;
        const account = getAccount(app, work.accountId);
        if (!account) return undefined;
        const platform = app.catalog[account.platform];
        const workflow = workflowById(work.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${work.workflowId}`,
          );
        const detail = workDetail(app, work);
        const state = redactValue(
          app,
          account.id,
          taskState(detail.work, workflow, platform),
        );
        return redactValue(app, account.id, {
          workId,
          context: detail.context,
          state,
          ...(detail.work.ask === undefined ? {} : { ask: detail.work.ask }),
          feedback: detail.work.feedbackHistory,
          log: detail.work.log,
        });
      });
      if (mirror) writeTaskMirror(app.paths, mirror);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let warning: string;
    try {
      const accountId = app.store.works.get(workId)?.accountId;
      warning = redactSecrets(
        `任务文件夹更新失败（${workId}）：${message}`,
        accountId ? secretValues(app, accountId) : [],
      );
    } catch {
      warning = `任务文件夹更新失败（${workId}），读取脱敏信息时再次出错。`;
    }
    try {
      app.warn(warning);
    } catch {
      // A warning sink must not turn a committed business operation into a failure.
    }
  }
}

export function statusConflict(work: Work): LeafPressError {
  return new LeafPressError(
    "STATE_CONFLICT",
    `作品现在是${WORK_STATUS_LABEL[work.status]}，不在进行中`,
  );
}

export function usableWorkflow(
  app: AppContext,
  workflowId: string,
  account: Account,
): boolean {
  const workflow = workflowById(workflowId);
  return workflow !== undefined && isUsable(workflow, account.settings);
}
