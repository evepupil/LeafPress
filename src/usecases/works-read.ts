import { sortColumn, type WorkStatus } from "@leafpress/core";
import type { UseCases } from "@leafpress/core";
import type { AppContext } from "./context.js";
import { requireWork, workDetail } from "./support.js";

const STATUS_ORDER: WorkStatus[] = ["todo", "doing", "waiting", "done"];

export function createWorksReadUseCases(
  app: AppContext,
): Pick<UseCases, "listWorks" | "showWork"> {
  return {
    listWorks(filter) {
      return app.store.transaction(() => {
        const works = app.store.works.list();
        return STATUS_ORDER.filter(
          (status) =>
            filter?.status === undefined || filter.status.includes(status),
        )
          .flatMap((status) => sortColumn(works, status))
          .filter(
            (work) =>
              filter?.accountId === undefined ||
              work.accountId === filter.accountId,
          );
      });
    },
    showWork(id) {
      return app.store.transaction(() => workDetail(app, requireWork(app, id)));
    },
  };
}
