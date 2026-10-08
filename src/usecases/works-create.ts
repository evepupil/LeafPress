import {
  convert,
  bottomOrder,
  markConverted,
  topIdeaOrder,
  type CreateWorksInput,
  type UseCases,
  type Work,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { AppContext } from "./context.js";
import {
  nowParts,
  requireAccount,
  requireIdea,
  requireWork,
  syncTaskFolder,
} from "./support.js";

export function createWorksCreateUseCases(
  app: AppContext,
): Pick<UseCases, "createWorks"> {
  return {
    createWorks(input: CreateWorksInput): Work[] {
      const { at } = nowParts(app);
      const created = app.store.transaction(() => {
        if (input.accountIds.length === 0)
          throw new LeafPressError("USAGE", "至少要选一个账号");
        if (new Set(input.accountIds).size !== input.accountIds.length)
          throw new LeafPressError("USAGE", "账号不能重复");
        const accounts = input.accountIds.map((id) => requireAccount(app, id));
        let source: Parameters<typeof convert>[0];
        if (input.source.kind === "idea") {
          source = {
            kind: "idea",
            idea: requireIdea(app, input.source.ideaId),
          };
        } else if (input.source.kind === "work") {
          const sourceWork = requireWork(app, input.source.workId);
          source = {
            kind: "work",
            work: sourceWork,
            platform: requireAccount(app, sourceWork.accountId).platform,
          };
        } else {
          if (!input.source.title.trim())
            throw new LeafPressError("USAGE", "标题不能为空");
          source = { kind: "new", title: input.source.title.trim() };
        }

        const allWorks = app.store.works.list();
        const ids = accounts.map((account) => {
          const serial = app.store.meta.nextSerial("work");
          return `${app.catalog[account.platform].idPrefix}-${serial}`;
        });
        const works = convert(source, accounts, input.brief, {
          at,
          ids,
          firstOrder: bottomOrder(allWorks),
        });
        for (const work of works) app.store.works.insert(work);

        if (source.kind === "idea") {
          const ideas = app.store.ideas.list();
          const converted = markConverted(
            source.idea,
            works.map((work) => work.id),
            {
              at,
              order: topIdeaOrder(ideas, "converted"),
            },
          );
          app.store.ideas.update(converted);
        }
        return works;
      });
      for (const work of created) syncTaskFolder(app, work.id);
      return created;
    },
  };
}
