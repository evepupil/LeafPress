import { describe, expect, it } from "vitest";
import {
  addAccount,
  blogSettings,
  createWork,
  withUseCases,
} from "./helpers.js";

describe("工作流要先配好才能接手", () => {
  it("博客账号没配仓库位置和站点地址：接手报缺什么，startNext 跳过它；配齐后才能接手", async () => {
    await withUseCases(({ usecases, home }) => {
      const account = addAccount(usecases);
      const work = createWork(usecases, account.id);
      const settings = blogSettings(home);

      expect(usecases.startNext()).toBeUndefined();
      expect(() => usecases.startWork({ id: work.id })).toThrowError(
        expect.objectContaining({
          code: "STATE_CONFLICT",
          message: "「博客写稿」要先配：博客仓库位置、站点地址",
          hint: "在网页的账号详情 · 接入里填",
        }),
      );

      usecases.setSetting(account.id, "repo-path", settings["repo-path"] ?? "");
      expect(() => usecases.startWork({ id: work.id })).toThrowError(
        expect.objectContaining({
          message: "「博客写稿」要先配：站点地址",
        }),
      );

      usecases.setSetting(account.id, "site-url", settings["site-url"] ?? "");
      expect(usecases.startNext()?.detail.work.id).toBe(work.id);
    });
  });

  it("没有专用工作流的平台用通用写稿，什么都不用配就能接手", async () => {
    await withUseCases(({ usecases }) => {
      const account = addAccount(usecases, "知乎号", "zhihu");
      const work = createWork(usecases, account.id);

      expect(work.workflowId).toBe("general-write");
      expect(usecases.startNext()?.detail.work.id).toBe(work.id);
    });
  });
});
