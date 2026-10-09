import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { sortColumn, type WorkStatus, type UseCases } from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import { listTaskFiles, taskFolderPath } from "../files/task-folder.js";
import type { AppContext } from "./context.js";
import { requireWork, workDetail } from "./support.js";

const STATUS_ORDER: WorkStatus[] = ["todo", "doing", "waiting", "done"];

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** 按扩展名给 Content-Type，不认识的按二进制流 */
export function contentTypeFor(name: string): string {
  return (
    CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream"
  );
}

export function createWorksReadUseCases(
  app: AppContext,
): Pick<UseCases, "listWorks" | "showWork" | "readWorkFile"> {
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
    readWorkFile(id, name) {
      const work = app.store.transaction(() => requireWork(app, id));
      // 只比对名单，不拼路径再判断：能拼出来的路径一定在任务文件夹里面，防路径穿越
      if (!listTaskFiles(app.paths, work.id).includes(name)) {
        throw new LeafPressError(
          "NOT_FOUND",
          `任务文件夹里没有这个文件：${name}`,
        );
      }
      const folder = taskFolderPath(app.paths, work.id);
      try {
        const body = readFileSync(join(folder, ...name.split("/")));
        return { contentType: contentTypeFor(name), body };
      } catch {
        throw new LeafPressError(
          "NOT_FOUND",
          `任务文件夹里没有这个文件：${name}`,
        );
      }
    },
  };
}
