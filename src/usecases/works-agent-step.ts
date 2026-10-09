import { setTimeout as delay } from "node:timers/promises";
import {
  addMinutes,
  applyCodeResult,
  backToStep,
  completeAiStep,
  currentStep,
  releaseWork as applyReleaseWork,
  topOrder,
  workflowById,
  waitingLabel,
  type CodeOutcome,
  type StepResult,
  type UseCases,
  type Work,
  type WorkflowDef,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import { taskFolderPath, missingFiles } from "../files/task-folder.js";
import type { CodeStepContext } from "../platforms/types.js";
import type { AppContext } from "./context.js";
import { checkLease } from "./agent-support.js";
import {
  nowParts,
  redactValueWithSecrets,
  requireAccount,
  secretValues,
  syncTaskFolder,
  unwrapWork,
  workDetail,
  workVars,
} from "./support.js";

function renew(app: AppContext, work: Work, token: string, at: string): Work {
  const updated: Work = {
    ...work,
    lease: {
      since: work.lease?.since ?? at,
      expiresAt: addMinutes(at, app.config.lease.minutes),
    },
    updatedAt: at,
  };
  app.store.works.update(updated, { token });
  return updated;
}

function resultMessage(work: Work, workflow: WorkflowDef): string {
  if (work.status === "done")
    return `已完成${work.url ? `，链接：${work.url}` : ""}`;
  if (work.status === "waiting")
    return `停在等你处理：${waitingLabel(work, workflow)}`;
  const step = currentStep(work, workflow);
  if (step?.kind === "ai") return `下一步：${step.name}（AI）`;
  if (step?.kind === "code")
    return `下一步：${step.name}（自动），运行 leafpress work run ${work.id}`;
  return "已完成";
}

function applyAgentTransition(
  app: AppContext,
  current: Work,
  token: string,
  next: Work,
  at: string,
): Work {
  if (next.status === "doing") {
    return renew(app, { ...next, lease: current.lease }, token, at);
  }
  const finished = { ...next, lease: undefined };
  app.store.works.update(finished, null);
  return finished;
}

function stepResult(
  app: AppContext,
  work: Work,
  workflow: WorkflowDef,
  token: string,
): StepResult {
  return {
    detail: workDetail(app, work),
    ...(work.status === "doing" && work.lease
      ? { lease: { token, expiresAt: work.lease.expiresAt } }
      : {}),
    message: resultMessage(work, workflow),
  };
}

function codeContext(
  app: AppContext,
  input: {
    work: Work;
    account: ReturnType<typeof requireAccount>;
    workflow: WorkflowDef;
    step: NonNullable<ReturnType<typeof currentStep>>;
    date: Date;
    today: string;
    heartbeat(): void;
  },
): CodeStepContext {
  const folder = taskFolderPath(app.paths, input.work.id);
  return {
    work: input.work,
    account: input.account,
    workflow: input.workflow,
    step: input.step,
    folder,
    today: input.today,
    now: input.date,
    setting(key) {
      return input.account.settings.find((setting) => setting.key === key)
        ?.value;
    },
    secret(key) {
      return app.credentials.get(input.account.id, key);
    },
    exec: app.exec,
    fetch: app.fetch,
    sleep: (ms) => delay(ms),
    heartbeat: () => input.heartbeat(),
  };
}

export function createWorksAgentStepUseCases(
  app: AppContext,
): Pick<UseCases, "stepWork" | "runWork" | "backWork" | "releaseWork"> {
  return {
    stepWork(id, token, options) {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const work = checkLease(app, id, token);
        const account = requireAccount(app, work.accountId);
        const workflow = workflowById(work.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${work.workflowId}`,
          );
        const step = currentStep(work, workflow);
        if (step?.kind === "ai" && step.produces?.length) {
          const missing = missingFiles(app.paths, id, step.produces);
          if (missing.length && !options?.force) {
            throw new LeafPressError(
              "STEP_OUTPUT_INVALID",
              `这一步要产出 ${missing.join("、")}，任务文件夹里还没有`,
              {
                hint: `放进 ${taskFolderPath(app.paths, id)} 后再运行；确定不需要就加 --force`,
              },
            );
          }
        }
        const next = unwrapWork(
          completeAiStep(work, workflow, {
            at,
            vars: workVars(app, work, account),
          }),
        );
        return applyAgentTransition(app, work, token, next, at);
      });
      syncTaskFolder(app, id);
      const workflow = workflowById(updated.workflowId);
      if (!workflow)
        throw new LeafPressError(
          "INTERNAL",
          `找不到工作流：${updated.workflowId}`,
        );
      return stepResult(app, updated, workflow, token);
    },

    async runWork(id, token) {
      const initial = nowParts(app);
      const prepared = app.store.transaction(() => {
        const work = checkLease(app, id, token);
        const account = requireAccount(app, work.accountId);
        const workflow = workflowById(work.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${work.workflowId}`,
          );
        const step = currentStep(work, workflow);
        if (step?.kind !== "code")
          throw new LeafPressError("STATE_CONFLICT", "当前步骤不是自动步骤");
        const handler = app.platforms.codeStep(work.workflowId, step.id);
        if (!handler)
          throw new LeafPressError(
            "INTERNAL",
            `找不到代码步骤实现：${work.workflowId}/${step.id}`,
          );
        const renewed = renew(app, work, token, initial.at);
        return {
          work: renewed,
          account,
          workflow,
          step,
          handler,
          secretsBefore: secretValues(app, account.id),
        };
      });
      syncTaskFolder(app, id);

      const heartbeat = (): void => {
        const { at } = nowParts(app);
        app.store.transaction(() => {
          const current = checkLease(app, id, token);
          renew(app, current, token, at);
        });
        syncTaskFolder(app, id);
      };
      let outcome: CodeOutcome;
      try {
        outcome = await prepared.handler(
          codeContext(app, {
            work: prepared.work,
            account: prepared.account,
            workflow: prepared.workflow,
            step: prepared.step,
            date: initial.date,
            today: initial.today,
            heartbeat,
          }),
        );
      } catch (error) {
        const message =
          error instanceof LeafPressError
            ? error.message
            : `内部错误：${error instanceof Error ? error.message : String(error)}`;
        outcome = { kind: "fail", error: message };
      }
      const safeOutcome = redactValueWithSecrets(
        app,
        prepared.account.id,
        outcome,
        prepared.secretsBefore,
      );
      const { at } = nowParts(app);
      const finalWork = app.store.transaction(() => {
        const current = app.store.works.get(id);
        if (
          !current ||
          current.status !== "doing" ||
          app.store.works.leaseToken(id) !== token ||
          current.workflowId !== prepared.work.workflowId ||
          current.step !== prepared.work.step
        ) {
          throw new LeafPressError(
            "STATE_CONFLICT",
            "执行期间作品被挪走了，这次的结果没有记下",
          );
        }
        const account = requireAccount(app, current.accountId);
        const workflow = workflowById(current.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${current.workflowId}`,
          );
        const next = unwrapWork(
          applyCodeResult(current, workflow, safeOutcome, {
            at,
            vars: workVars(app, current, account),
          }),
        );
        return applyAgentTransition(app, current, token, next, at);
      });
      syncTaskFolder(app, id);
      const workflow = workflowById(finalWork.workflowId);
      if (!workflow)
        throw new LeafPressError(
          "INTERNAL",
          `找不到工作流：${finalWork.workflowId}`,
        );
      return {
        ...stepResult(app, finalWork, workflow, token),
        message:
          safeOutcome.kind === "fail"
            ? `出错了：${safeOutcome.error}`
            : resultMessage(finalWork, workflow),
        outcome: safeOutcome,
      };
    },

    backWork(id, token, stepNumber) {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const work = checkLease(app, id, token);
        const account = requireAccount(app, work.accountId);
        const workflow = workflowById(work.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${work.workflowId}`,
          );
        const next = unwrapWork(
          backToStep(work, workflow, stepNumber - 1, {
            at,
            vars: workVars(app, work, account),
          }),
        );
        return applyAgentTransition(app, work, token, next, at);
      });
      syncTaskFolder(app, id);
      const workflow = workflowById(updated.workflowId);
      if (!workflow)
        throw new LeafPressError(
          "INTERNAL",
          `找不到工作流：${updated.workflowId}`,
        );
      return stepResult(app, updated, workflow, token);
    },

    releaseWork(id, token) {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const work = checkLease(app, id, token);
        const next = unwrapWork(
          applyReleaseWork(work, {
            at,
            order: topOrder(app.store.works.list()),
          }),
        );
        app.store.works.update(next, null);
        return next;
      });
      syncTaskFolder(app, id);
      return updated;
    },
  };
}
