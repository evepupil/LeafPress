import {
  moveIdea as applyMoveIdea,
  newIdeaId,
  reorderIdeas,
  sortIdeas,
  topIdeaOrder,
  updateIdea as applyUpdateIdea,
  type AddIdeaInput,
  type Idea,
  type IdeaSource,
  type IdeaStatus,
  type MoveIdeaInput,
  type UpdateIdeaInput,
  type UseCases,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { AppContext } from "./context.js";
import { nowParts, requireAccount, requireIdea } from "./support.js";

const IDEA_SOURCES = new Set<IdeaSource>([
  "quick",
  "devlog",
  "cloudmind",
  "trend",
  "bookmark",
  "batch",
  "schedule",
]);
const IDEA_STATUSES: IdeaStatus[] = ["inbox", "promising", "converted"];

export function createIdeasUseCases(
  app: AppContext,
): Pick<
  UseCases,
  "listIdeas" | "addIdeas" | "updateIdea" | "moveIdea" | "deleteIdea"
> {
  return {
    listIdeas(filter) {
      return app.store.transaction(() => {
        const ideas = app.store.ideas.list();
        return IDEA_STATUSES.filter(
          (status) =>
            filter?.status === undefined || filter.status.includes(status),
        ).flatMap((status) => sortIdeas(ideas, status));
      });
    },

    addIdeas(inputs: AddIdeaInput[]): Idea[] {
      const { at } = nowParts(app);
      return app.store.transaction(() => {
        const ideas = app.store.ideas.list();
        const firstOrder = topIdeaOrder(ideas, "inbox") - inputs.length + 1;
        return inputs.map((input, index) => {
          const text = input.text.trim();
          if (!text) throw new LeafPressError("USAGE", "灵感内容不能为空");
          if (!IDEA_SOURCES.has(input.source))
            throw new LeafPressError(
              "USAGE",
              `灵感来源不合法：${String(input.source)}`,
            );
          if (input.accountId !== undefined)
            requireAccount(app, input.accountId);
          const serial = app.store.meta.nextSerial("idea");
          const idea: Idea = {
            id: newIdeaId(serial),
            text,
            detail: input.detail ?? "",
            status: "inbox",
            source: input.source,
            ...(input.sourceDetail === undefined
              ? {}
              : { sourceDetail: input.sourceDetail }),
            ...(input.accountId === undefined
              ? {}
              : { accountId: input.accountId }),
            order: firstOrder + index,
            createdAt: at,
            updatedAt: at,
            workIds: [],
          };
          app.store.ideas.insert(idea);
          return idea;
        });
      });
    },

    updateIdea(id: string, patch: UpdateIdeaInput): Idea {
      const { at } = nowParts(app);
      return app.store.transaction(() => {
        const idea = requireIdea(app, id);
        if (patch.accountId !== undefined && patch.accountId !== null)
          requireAccount(app, patch.accountId);
        const result = applyUpdateIdea(idea, patch, { at });
        if (!result.ok)
          throw new LeafPressError(
            result.code === "INVALID" ? "USAGE" : "STATE_CONFLICT",
            result.reason,
          );
        app.store.ideas.update(result.idea);
        return result.idea;
      });
    },

    moveIdea(id: string, input: MoveIdeaInput): Idea {
      const { at } = nowParts(app);
      return app.store.transaction(() => {
        const ideas = app.store.ideas.list();
        const idea = requireIdea(app, id);
        const lastOrder =
          ideas
            .filter((item) => item.status === input.status)
            .reduce((max, item) => Math.max(max, item.order), 0) + 1;
        const result = applyMoveIdea(idea, input.status, {
          at,
          order: lastOrder,
        });
        if (!result.ok)
          throw new LeafPressError("STATE_CONFLICT", result.reason);
        const candidates = ideas.map((item) =>
          item.id === id ? result.idea : item,
        );
        const orderMap = reorderIdeas(
          candidates,
          id,
          input.status,
          input.beforeId,
        );
        let output = result.idea;
        for (const candidate of candidates) {
          const order = orderMap.get(candidate.id);
          if (order === undefined) continue;
          if (candidate.id !== id && order === candidate.order) continue;
          const updated = { ...candidate, order };
          app.store.ideas.update(updated);
          if (candidate.id === id) output = updated;
        }
        return output;
      });
    },

    deleteIdea(id: string): void {
      app.store.transaction(() => {
        requireIdea(app, id);
        app.store.ideas.remove(id);
      });
    },
  };
}
