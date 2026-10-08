import { pickNext, type StartResult, type UseCases } from "@leafpress/core";
import type { AppContext } from "./context.js";
import { canStart, startSpecific } from "./agent-support.js";
import {
  nowParts,
  requireWork,
  syncTaskFolder,
  workDetail,
} from "./support.js";

export function createWorksAgentUseCases(
  app: AppContext,
): Pick<UseCases, "startWork" | "startNext"> {
  return {
    startWork(input) {
      const { at, date } = nowParts(app);
      const result = app.store.transaction(() =>
        startSpecific(app, input.id, input.force ?? false, at, date),
      );
      syncTaskFolder(app, input.id);
      return {
        ...result,
        detail: app.store.transaction(() =>
          workDetail(app, requireWork(app, input.id)),
        ),
      };
    },

    startNext(input = {}) {
      const { at, date } = nowParts(app);
      const result = app.store.transaction(() => {
        const works = app.store.works
          .list()
          .filter(
            (work) =>
              input.accountId === undefined ||
              work.accountId === input.accountId,
          );
        const candidate = pickNext(works, (work) => canStart(app, work));
        if (!candidate) return undefined;
        return {
          id: candidate.id,
          result: startSpecific(app, candidate.id, false, at, date),
        };
      });
      if (!result) return undefined;
      syncTaskFolder(app, result.id);
      return {
        ...result.result,
        detail: app.store.transaction(() =>
          workDetail(app, requireWork(app, result.id)),
        ),
      } satisfies StartResult;
    },
  };
}
