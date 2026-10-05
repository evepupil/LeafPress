import { LeafPressError } from "../shared/errors.js";
import type { RunReport } from "./types.js";
import type { ExecutionContext } from "./engine-shared.js";
import {
  getRunOrThrow,
  leaseExpiry,
  nowDate,
  reportFor,
} from "./engine-shared.js";

export function cancelRun(
  context: ExecutionContext,
  runId: string,
  options?: { readonly force?: boolean },
): RunReport {
  const run = getRunOrThrow(context, runId);
  if (run.state === "waiting" || run.state === "failed") {
    const cancelled = context.deps.store.transitionRun(
      runId,
      ["waiting", "failed"],
      "cancelled",
    );
    if (!cancelled) {
      throw new LeafPressError(
        "RUN_STATE_CONFLICT",
        "状态已经变了，请重新查看",
      );
    }
    return reportFor(context, getRunOrThrow(context, runId));
  }

  if (run.state === "running") {
    const now = nowDate(context);
    const expired =
      run.leaseExpiresAt !== undefined &&
      Date.parse(run.leaseExpiresAt) < now.getTime();
    if (expired && options?.force === true) {
      const acquired = context.deps.store.acquireRun(runId, {
        from: [],
        owner: context.owner,
        leaseExpiresAt: leaseExpiry(context, now),
        now: now.toISOString(),
        takeOverExpired: true,
      });
      if (!acquired) {
        throw new LeafPressError(
          "RUN_STATE_CONFLICT",
          "状态已经变了，请重新查看",
        );
      }
      const cancelled = context.deps.store.releaseRun(
        runId,
        context.owner,
        "cancelled",
      );
      if (!cancelled) {
        throw new LeafPressError(
          "RUN_STATE_CONFLICT",
          "执行权已被别的进程接管，本进程停止",
        );
      }
      return reportFor(context, getRunOrThrow(context, runId));
    }
    throw new LeafPressError(
      "RUN_STATE_CONFLICT",
      "正在运行，不能取消；如果确定上次异常退出，等租约过期后加 --force",
    );
  }

  throw new LeafPressError("RUN_STATE_CONFLICT", "这次运行已经结束");
}
