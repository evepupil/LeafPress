import { existsSync } from "node:fs";
import {
  bottomOrder,
  moveWork as applyMoveWork,
  reorderTodo,
  submitFeedback as applyFeedback,
  topOrder,
  updateWork as applyUpdateWork,
  workflowsFor,
  workflowById,
  type MoveWorkInput,
  type UpdateWorkInput,
  type UseCases,
  type Work,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import { taskFolderPath } from "../files/task-folder.js";
import { openFolder } from "../files/open-folder.js";
import type { WorkflowDef } from "@leafpress/core";
import type { AppContext } from "./context.js";
import {
  nowParts,
  requireAccount,
  requireWork,
  syncTaskFolder,
  unwrapWork,
  workVars,
} from "./support.js";

export function createWorksEditUseCases(
  app: AppContext,
): Pick<
  UseCases,
  "updateWork" | "moveWork" | "submitFeedback" | "deleteWork" | "openWorkFolder"
> {
  return {
    updateWork(id: string, patch: UpdateWorkInput): Work {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const work = requireWork(app, id);
        let workflow: WorkflowDef | undefined;
        if (
          patch.workflowId !== undefined &&
          patch.workflowId !== work.workflowId
        ) {
          const account = requireAccount(app, work.accountId);
          workflow = workflowById(patch.workflowId);
          if (
            !workflow ||
            !workflowsFor(account.platform).some(
              (candidate) => candidate.id === workflow?.id,
            )
          ) {
            throw new LeafPressError("USAGE", "这个平台不能使用该工作流");
          }
        }
        const next = unwrapWork(applyUpdateWork(work, patch, { at, workflow }));
        app.store.works.update(next);
        return next;
      });
      syncTaskFolder(app, id);
      return updated;
    },

    moveWork(id: string, input: MoveWorkInput): Work {
      const { at } = nowParts(app);
      const result = app.store.transaction(() => {
        const current = requireWork(app, id);
        const allWorks = app.store.works.list();
        const account = requireAccount(app, current.accountId);
        const workflow = workflowById(current.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${current.workflowId}`,
          );
        const vars = workVars(app, current, account);
        let moved = current;
        if (input.status !== "todo" || current.status !== "todo") {
          moved = unwrapWork(
            applyMoveWork(current, workflow, input.status, {
              at,
              order: bottomOrder(allWorks),
              vars,
            }),
          );
        }

        if (input.status !== "todo") {
          if (moved !== current)
            app.store.works.update(
              moved,
              current.status === "doing" ? null : undefined,
            );
          return { work: moved, changed: moved !== current };
        }

        const candidateWorks = allWorks.map((work) =>
          work.id === id ? moved : work,
        );
        const orders = reorderTodo(candidateWorks, id, input.beforeId);
        let resultWork = moved;
        let changed = moved !== current;
        for (const work of candidateWorks) {
          const order = orders.get(work.id);
          if (order === undefined || (order === work.order && work.id !== id))
            continue;
          if (work.id === id && !changed && order === current.order) continue;
          const next = { ...work, order };
          app.store.works.update(
            next,
            work.id === id && current.status === "doing" ? null : undefined,
          );
          if (work.id === id) resultWork = next;
          changed = true;
        }
        return { work: resultWork, changed };
      });
      if (result.changed) syncTaskFolder(app, id);
      return result.work;
    },

    submitFeedback(id: string, text: string): Work {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const work = requireWork(app, id);
        const workflow = workflowById(work.workflowId);
        if (!workflow)
          throw new LeafPressError(
            "INTERNAL",
            `找不到工作流：${work.workflowId}`,
          );
        const next = unwrapWork(
          applyFeedback(work, workflow, text, {
            at,
            order: topOrder(app.store.works.list()),
          }),
        );
        app.store.works.update(next);
        return next;
      });
      syncTaskFolder(app, id);
      return updated;
    },

    deleteWork(id: string): void {
      app.store.transaction(() => {
        requireWork(app, id);
        app.store.works.remove(id);
      });
    },

    async openWorkFolder(id: string): Promise<string> {
      app.store.transaction(() => requireWork(app, id));
      const folder = taskFolderPath(app.paths, id);
      if (!existsSync(folder)) syncTaskFolder(app, id);
      await openFolder(app.exec, folder);
      return folder;
    },
  };
}
