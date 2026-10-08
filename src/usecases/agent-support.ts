import {
  addMinutes,
  isUsable,
  timeMs,
  waitingLabel,
  workflowById,
  WORK_STATUS_LABEL,
  startWork as applyStartWork,
  type StartResult,
  type Work,
  type WorkflowDef,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { AppContext } from "./context.js";
import {
  getAccount,
  requireAccount,
  requireWork,
  usableWorkflow,
  workDetail,
  workVars,
  unwrapWork,
} from "./support.js";

export function checkLease(app: AppContext, id: string, token: string): Work {
  const work = requireWork(app, id);
  if (work.status !== "doing") {
    throw new LeafPressError(
      "STATE_CONFLICT",
      `作品现在是${WORK_STATUS_LABEL[work.status]}，不在进行中`,
    );
  }
  if (app.store.works.leaseToken(id) !== token) {
    throw new LeafPressError(
      "STATE_CONFLICT",
      "令牌对不上：这个作品已经被别人接手或挪走了",
      {
        hint: `运行 leafpress work show ${id} 看现在的情况`,
      },
    );
  }
  return work;
}

function timeLabel(time: string): string {
  const month = Number(time.slice(5, 7));
  const day = Number(time.slice(8, 10));
  return `${month}月${day}日 ${time.slice(11, 16)}`;
}

function unusableReason(
  workflow: WorkflowDef,
  account: ReturnType<typeof requireAccount>,
  app: AppContext,
): string {
  const labels = workflow.requires
    .filter(
      (key) =>
        !account.settings.some(
          (setting) => setting.key === key && setting.status === "ok",
        ),
    )
    .map(
      (key) =>
        app.catalog[account.platform].setupItems.find(
          (item) => item.key === key,
        )?.label ?? key,
    );
  return `「${workflow.name}」要先配：${labels.join("、")}`;
}

export function startSpecific(
  app: AppContext,
  id: string,
  force: boolean,
  at: string,
  date: Date,
): StartResult {
  const work = requireWork(app, id);
  const account = requireAccount(app, work.accountId);
  const workflow = workflowById(work.workflowId);
  if (!workflow)
    throw new LeafPressError("INTERNAL", `找不到工作流：${work.workflowId}`);
  let takeover = false;
  if (work.status === "doing") {
    const expired =
      !work.lease || timeMs(work.lease.expiresAt) <= date.getTime();
    if (!force && !expired) {
      throw new LeafPressError(
        "STATE_CONFLICT",
        `这个作品正在被别的 agent 做（${timeLabel(work.lease?.since ?? at)} 接手，租约到 ${timeLabel(work.lease?.expiresAt ?? at)}）`,
        { hint: "如果就是你自己（比如对话被压缩、令牌丢了），加 --force 接管" },
      );
    }
    takeover = true;
  } else if (work.status === "waiting") {
    throw new LeafPressError(
      "STATE_CONFLICT",
      `这一步要作者来做：${waitingLabel(work, workflow)}`,
      {
        hint: "作者在网页上写反馈后，作品会回到待实现",
      },
    );
  } else if (work.status === "done") {
    throw new LeafPressError("STATE_CONFLICT", "这个作品已经完成了");
  }
  if (!isUsable(workflow, account.settings)) {
    throw new LeafPressError(
      "STATE_CONFLICT",
      unusableReason(workflow, account, app),
      {
        hint: "在网页的账号详情 · 接入里填",
      },
    );
  }

  const lease = {
    since: at,
    expiresAt: addMinutes(at, app.config.lease.minutes),
  };
  const result = unwrapWork(
    applyStartWork(work, workflow, {
      at,
      lease,
      vars: workVars(app, work, account),
      ...(takeover ? { takeover: true } : {}),
    }),
  );
  const token = result.status === "doing" ? app.newToken() : undefined;
  app.store.works.update(result, token === undefined ? null : { token });

  let message: string;
  if (result.status === "done") message = "已完成";
  else if (result.status === "waiting") {
    const label =
      workflow.steps[result.step]?.name ?? waitingLabel(result, workflow);
    message = `这一步要作者来做，已停在等你处理：${label}`;
  } else if (
    work.feedback &&
    workflow.steps[work.step]?.kind === "manual" &&
    work.step !== result.step
  ) {
    message = `读了你的反馈，接着做：${workflow.steps[result.step]?.name ?? ""}`;
  } else {
    message = `接手了：${workflow.steps[result.step]?.name ?? ""}`;
  }
  return {
    detail: workDetail(app, result),
    ...(result.status === "doing" && token !== undefined
      ? {
          lease: {
            token,
            expiresAt: result.lease?.expiresAt ?? lease.expiresAt,
          },
        }
      : {}),
    message,
  };
}

export function canStart(app: AppContext, work: Work): boolean {
  const account = getAccount(app, work.accountId);
  return account !== undefined && usableWorkflow(app, work.workflowId, account);
}
