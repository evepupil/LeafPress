import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildDataset,
  type AccountDayRecord,
  type WorkSnapshotRecord,
} from "@leafpress/core";
import { describe, expect, it } from "vitest";
import { readProfile, writeProfile } from "../../src/files/profiles.js";
import { homePaths } from "../../src/config/home.js";
import { LeafPressError } from "../../src/shared/errors.js";
import {
  withUseCases,
  addAccount,
  catalogWith,
  createWork,
} from "./helpers.js";
import type {
  CodeStepHandler,
  DataPullOutcome,
  DataTool,
} from "../../src/platforms/types.js";

function expectCode(action: () => unknown, code: string): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(LeafPressError);
  expect(caught).toMatchObject({ code });
}

const setupItems = [
  {
    key: "site-url",
    label: "站点地址",
    secret: false,
    usedFor: "data" as const,
  },
  {
    key: "analytics-token",
    label: "统计密钥",
    secret: true,
    usedFor: "data" as const,
  },
];

function catalogWithData() {
  return catalogWith({
    blog: {
      setupItems,
      dataTool: { mode: "api", provider: "测试统计" },
    },
  });
}

function catalogWithMultipleSecrets() {
  return catalogWith({
    blog: {
      setupItems: [
        ...setupItems,
        {
          key: "client-secret",
          label: "客户端密钥",
          secret: true,
          usedFor: "data" as const,
        },
      ],
      dataTool: { mode: "api", provider: "测试统计" },
    },
  });
}

describe("业务用例：灵感、账号、数据与系统", () => {
  it("7. 批量灵感顺序、换列重排、已转限制和删除来源", async () => {
    await withUseCases(({ usecases }) => {
      usecases.addIdeas([
        { text: "第一条", source: "quick" },
        { text: "第二条", source: "devlog" },
        { text: "第三条", source: "bookmark" },
      ]);
      const ideas = usecases.listIdeas();
      expect(ideas.map((idea) => idea.id)).toEqual(["i-1", "i-2", "i-3"]);
      expect(ideas.map((idea) => idea.order)).toEqual([-2, -1, 0]);
      expect(
        usecases.listIdeas({ status: ["inbox"] }).map((idea) => idea.id),
      ).toEqual(ideas.map((idea) => idea.id));
      usecases.moveIdea(ideas[2]!.id, { status: "promising", beforeId: null });
      usecases.moveIdea(ideas[1]!.id, {
        status: "promising",
        beforeId: ideas[2]!.id,
      });
      expect(
        usecases.listIdeas({ status: ["promising"] }).map((idea) => idea.id),
      ).toEqual([ideas[1]!.id, ideas[2]!.id]);
      const account = addAccount(usecases);
      const [converted] = usecases.createWorks({
        source: { kind: "idea", ideaId: ideas[0]!.id },
        accountIds: [account.id],
        brief: "",
      });
      if (!converted) throw new Error("作品没有创建");
      expectCode(
        () =>
          usecases.moveIdea(ideas[0]!.id, {
            status: "promising",
            beforeId: null,
          }),
        "STATE_CONFLICT",
      );
      usecases.deleteIdea(ideas[0]!.id);
      expect(usecases.showWork(converted.id).work.source).toEqual({
        kind: "idea",
        ideaId: ideas[0]!.id,
      });
      expectCode(
        () =>
          usecases.addIdeas([{ text: "非法来源", source: "unknown" as never }]),
        "USAGE",
      );
      expectCode(
        () => usecases.updateIdea(ideas[1]!.id, { text: " " }),
        "USAGE",
      );
    });
  });

  it("8. 账号目录注入、密钥隔离、档案读写和配置清空", async () => {
    await withUseCases(
      ({ usecases, app }) => {
        const paths = homePaths(app.paths.home);
        writeProfile(paths, "blog-1", "已有档案不应覆盖");
        const account = usecases.addAccount({
          platform: "blog",
          name: " 注入平台 ",
          intro: "新档案不应覆盖已有档案",
          settings: {
            "site-url": " https://site.example ",
            "analytics-token": "super-secret-token",
          },
        });
        expect(account.id).toBe("blog-1");
        expect(account.name).toBe("注入平台");
        expect(readProfile(paths, account.id).trim()).toBe("已有档案不应覆盖");
        expect(account.settings).toEqual([
          { key: "site-url", status: "ok", value: "https://site.example" },
          { key: "analytics-token", status: "ok" },
        ]);
        expect(app.credentials.get(account.id, "analytics-token")).toBe(
          "super-secret-token",
        );
        expect(readFileSync(app.paths.credentialsFile, "utf8")).toContain(
          "super-secret-token",
        );
        expect(app.store.settings.values(account.id)).toEqual({
          "site-url": "https://site.example",
        });
        expect(JSON.stringify(usecases.bootstrap())).not.toContain(
          "super-secret-token",
        );
        expectCode(
          () =>
            usecases.addAccount({
              platform: "blog",
              name: "错误配置",
              intro: "",
              settings: { unknown: "x" },
            }),
          "USAGE",
        );
        expectCode(
          () =>
            usecases.addAccount({
              platform: "constructor" as never,
              name: "原型键",
              intro: "",
            }),
          "USAGE",
        );
        expectCode(
          () =>
            usecases.addAccount({
              platform: "toString" as never,
              name: "原型键",
              intro: "",
            }),
          "USAGE",
        );
        expectCode(
          () =>
            usecases.updateAccount(account.id, { stage: "retired" as never }),
          "USAGE",
        );
        const freshProfile = usecases.addAccount({
          platform: "zhihu",
          name: "新档案账号",
          intro: "首次写入的档案",
        });
        expect(freshProfile.id).toBe("zhihu-2");
        expect(readProfile(paths, freshProfile.id)).toBe("首次写入的档案\n");

        const before = usecases.version().profilesStamp;
        const saved = usecases.saveProfile(account.id, "  更新后的档案  \n");
        expect(saved.profile.trimEnd()).toBe("  更新后的档案");
        expect(
          usecases
            .listAccounts()
            .find((item) => item.id === account.id)
            ?.profile.trim(),
        ).toBe("更新后的档案");
        expect(usecases.version().profilesStamp).toBeGreaterThan(before);

        const cleared = usecases.setSetting(
          account.id,
          "analytics-token",
          "   ",
        );
        expect(
          cleared.settings.find((setting) => setting.key === "analytics-token")
            ?.status,
        ).toBe("missing");
        expect(
          app.credentials.get(account.id, "analytics-token"),
        ).toBeUndefined();
        const updated = usecases.updateAccount(account.id, {
          name: "更新名",
          handle: "@name",
          url: "https://example.test",
        });
        expect(updated).toMatchObject({
          name: "更新名",
          handle: "@name",
          url: "https://example.test",
        });
        expect(
          usecases.updateAccount(account.id, { handle: null, url: null })
            .handle,
        ).toBeUndefined();
        expect(usecases.showAccount(account.id).setup.state).toBe("unfinished");
      },
      { catalog: catalogWithData() },
    );
  });

  it("9. 拉取成功、失败过期、缺配置拦截和 M1 无工具", async () => {
    let nextOutcome: DataPullOutcome = {
      ok: true,
      result: {
        account: [
          { day: "2026-10-07", followers: 42, reads: 120, interactions: 8 },
        ],
        works: [],
        note: "已读入统计",
      },
    };
    const dataTool = {
      pull(): Promise<DataPullOutcome> {
        return Promise.resolve(nextOutcome);
      },
    };
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases, "已配置账号", "blog", {
          "site-url": "https://site.example",
          "analytics-token": "analytics-secret",
        });
        const beforeSnapshot = usecases.version().snapshotSeq;
        const success = await usecases.pullData({ accountIds: [account.id] });
        expect(success).toMatchObject({
          outcomes: [{ accountId: account.id, status: "ok" }],
          note: "全部入库",
        });
        expect(usecases.version().snapshotSeq).toBeGreaterThan(beforeSnapshot);
        expect(
          app.store.snapshots.accountDays("2026-10-07", "2026-10-07"),
        ).toEqual([
          {
            accountId: account.id,
            day: "2026-10-07",
            followers: 42,
            reads: 120,
            interactions: 8,
          },
        ]);
        expect(usecases.showAccount(account.id).setup.source.status).toBe("ok");

        nextOutcome = {
          ok: false,
          reason: "接口拒绝 analytics-secret",
          fixHint: "更新密钥",
          expiredKey: "analytics-token",
        };
        const failed = await usecases.pullData({ accountIds: [account.id] });
        expect(failed.outcomes[0]).toMatchObject({
          status: "failed",
          reason: "接口拒绝 <redacted>",
        });
        expect(usecases.showAccount(account.id).setup).toMatchObject({
          state: "broken",
          items: [
            { key: "site-url", status: "ok" },
            { key: "analytics-token", status: "expired" },
          ],
        });

        const unconfigured = addAccount(usecases, "未配置账号");
        const blocked = await usecases.pullData({
          accountIds: [unconfigured.id],
        });
        expect(blocked.outcomes[0]).toMatchObject({
          accountId: unconfigured.id,
          status: "failed",
          reason: "站点地址未配置",
        });
        expect(
          app.store.pulls
            .latest()
            .find((record) => record.accountId === unconfigured.id)?.status,
        ).toBe("failed");
      },
      { catalog: catalogWithData(), dataTool },
    );

    await withUseCases(async ({ usecases }) => {
      const account = addAccount(usecases);
      expect(await usecases.pullData({ accountIds: [account.id] })).toEqual({
        outcomes: [],
        note: "没有能拉的账号",
      });
    });
  });

  it("拉取事务按账号隔离；NaN 失败不妨碍后续账号", async () => {
    const dataTool: DataTool = {
      pull({ account }) {
        return Promise.resolve(
          account.name === "坏数据账号"
            ? {
                ok: true,
                result: {
                  account: [{ day: "2026-10-07", followers: Number.NaN }],
                  works: [],
                },
              }
            : {
                ok: true,
                result: {
                  account: [{ day: "2026-10-07", followers: 17 }],
                  works: [],
                },
              },
        );
      },
    };
    await withUseCases(
      async ({ usecases, app }) => {
        const invalid = addAccount(usecases, "坏数据账号", "blog", {
          "site-url": "https://bad.example",
          "analytics-token": "bad-secret",
        });
        const valid = addAccount(usecases, "正常账号", "blog", {
          "site-url": "https://good.example",
          "analytics-token": "good-secret",
        });
        const result = await usecases.pullData({
          accountIds: [invalid.id, valid.id],
        });
        expect(result.outcomes).toMatchObject([
          { accountId: invalid.id, status: "failed" },
          { accountId: valid.id, status: "ok" },
        ]);
        expect(result.outcomes[0]?.reason).toContain("有限数字");
        const records = app.store.pulls.latest();
        const failedRecord = records.find(
          (record) => record.accountId === invalid.id,
        );
        expect(failedRecord?.status).toBe("failed");
        expect(failedRecord?.reason).toContain("有限数字");
        expect(
          records.find((record) => record.accountId === valid.id)?.status,
        ).toBe("ok");
        expect(
          app.store.snapshots.accountDays("2026-10-07", "2026-10-07"),
        ).toEqual([
          {
            accountId: valid.id,
            day: "2026-10-07",
            followers: 17,
            reads: null,
            interactions: null,
          },
        ]);
      },
      { catalog: catalogWithData(), dataTool },
    );
  });

  it("入库时重查作品归属；拉取期间删除或跨账号作品会跳过并警告", async () => {
    const warnings: string[] = [];
    let deleteFirstWork: (() => void) | undefined;
    let firstWorkId = "";
    let secondWorkId = "";
    const dataTool: DataTool = {
      pull({ account }) {
        if (account.name === "先拉账号") {
          deleteFirstWork?.();
          return Promise.resolve({
            ok: true,
            result: {
              account: [],
              works: [
                {
                  workId: firstWorkId,
                  day: "2026-10-07",
                  totals: { pageviews: 1 },
                },
                {
                  workId: secondWorkId,
                  day: "2026-10-07",
                  totals: { pageviews: 2 },
                },
              ],
            },
          });
        }
        return Promise.resolve({
          ok: true,
          result: {
            account: [],
            works: [
              {
                workId: secondWorkId,
                day: "2026-10-07",
                totals: { pageviews: 3 },
              },
            ],
          },
        });
      },
    };
    await withUseCases(
      async ({ usecases, app }) => {
        const first = addAccount(usecases, "先拉账号", "blog", {
          "site-url": "https://first.example",
          "analytics-token": "first-secret",
        });
        const second = addAccount(usecases, "后拉账号", "blog", {
          "site-url": "https://second.example",
          "analytics-token": "second-secret",
        });
        const firstWork = createWork(usecases, first.id, "拉取中删除");
        const secondWork = createWork(usecases, second.id, "另一账号作品");
        firstWorkId = firstWork.id;
        secondWorkId = secondWork.id;
        deleteFirstWork = () => usecases.deleteWork(firstWork.id);
        const result = await usecases.pullData({
          accountIds: [first.id, second.id],
        });
        expect(result.outcomes.map((item) => item.status)).toEqual([
          "ok",
          "ok",
        ]);
        expect(warnings).toHaveLength(2);
        expect(warnings.every((message) => message.includes("已跳过"))).toBe(
          true,
        );
        expect(
          app.store.snapshots.workSnapshots("2026-10-07", "2026-10-07"),
        ).toEqual([
          {
            workId: secondWork.id,
            day: "2026-10-07",
            totals: { pageviews: 3 },
          },
        ]);
      },
      {
        catalog: catalogWithData(),
        dataTool,
        warn: (message) => warnings.push(message),
      },
    );
  });

  it("10. dataset 与共享 buildDataset 对同一组快照一致", async () => {
    await withUseCases(({ usecases, app }) => {
      const account = addAccount(usecases);
      const work = createWork(usecases, account.id);
      const pending = createWork(usecases, account.id, "待实现但有数据");
      const completed = {
        ...work,
        status: "done" as const,
        step: 3,
        publishedAt: "2026-10-05",
        url: "https://example.test/article",
        updatedAt: "2026-10-07T12:00:00+08:00",
      };
      app.store.transaction(() => {
        app.store.works.update(completed);
        const accountDays: AccountDayRecord[] = [
          {
            accountId: account.id,
            day: "2026-10-05",
            followers: 8,
            reads: null,
            interactions: null,
          },
          {
            accountId: account.id,
            day: "2026-10-06",
            followers: 10,
            reads: null,
            interactions: null,
          },
          {
            accountId: account.id,
            day: "2026-10-07",
            followers: 11,
            reads: null,
            interactions: null,
          },
        ];
        const snapshots: WorkSnapshotRecord[] = [
          {
            workId: work.id,
            day: "2026-10-05",
            totals: { pageviews: 10, visitors: 8 },
          },
          {
            workId: work.id,
            day: "2026-10-06",
            totals: { pageviews: 25, visitors: 20 },
          },
          {
            workId: work.id,
            day: "2026-10-07",
            totals: { pageviews: 32, visitors: 25 },
          },
          {
            workId: pending.id,
            day: "2026-10-06",
            totals: { pageviews: 4, visitors: 2 },
          },
          {
            workId: pending.id,
            day: "2026-10-07",
            totals: { pageviews: 9, visitors: 5 },
          },
        ];
        for (const record of accountDays)
          app.store.snapshots.putAccountDay(record);
        for (const snapshot of snapshots)
          app.store.snapshots.putWorkSnapshot(snapshot);
      });
      const today = "2026-10-08";
      const expected = buildDataset({
        today,
        accounts: usecases.listAccounts(),
        works: usecases.listWorks(),
        accountDays: app.store.snapshots.accountDays(
          "2026-04-09",
          "2026-10-07",
        ),
        workSnapshots: app.store.snapshots.workSnapshots(
          "2026-04-09",
          "2026-10-07",
        ),
      });
      const dataset = usecases.dataset();
      expect(dataset).toEqual(expected);
      expect(dataset.workDays[pending.id]).toBeDefined();
    });
  });

  it("11. 周报仅接受周一并按周覆盖", async () => {
    await withUseCases(({ usecases }) => {
      expectCode(
        () => usecases.saveNote("abc", { wins: "a", improve: "b", next: "c" }),
        "USAGE",
      );
      expectCode(
        () =>
          usecases.saveNote("2026-10-05T00:00", {
            wins: "a",
            improve: "b",
            next: "c",
          }),
        "USAGE",
      );
      expectCode(
        () =>
          usecases.saveNote("2026-02-30", {
            wins: "a",
            improve: "b",
            next: "c",
          }),
        "USAGE",
      );
      expect(() =>
        usecases.saveNote("2026-10-08", { wins: "a", improve: "b", next: "c" }),
      ).toThrow(/必须是周一/);
      expect(
        usecases.saveNote("2026-10-05", {
          wins: "初稿",
          improve: "",
          next: "下周",
        }),
      ).toMatchObject({ week: "2026-10-05", wins: "初稿" });
      expect(
        usecases.saveNote("2026-10-05", {
          wins: "更新",
          improve: "改进",
          next: "继续",
        }),
      ).toMatchObject({ wins: "更新", improve: "改进", next: "继续" });
    });
  });

  it("12. bootstrap 结构、写操作版本递增和备份文件夹", async () => {
    await withUseCases(({ usecases }) => {
      const initial = usecases.version().seq;
      const account = addAccount(usecases);
      const afterAccount = usecases.version().seq;
      expect(afterAccount).toBeGreaterThan(initial);
      const [idea] = usecases.addIdeas([{ text: "版本测试", source: "quick" }]);
      const afterIdea = usecases.version().seq;
      expect(afterIdea).toBeGreaterThan(afterAccount);
      usecases.saveNote("2026-10-05", {
        wins: "完成",
        improve: "",
        next: "继续",
      });
      expect(usecases.version().seq).toBeGreaterThan(afterIdea);
      const bootstrap = usecases.bootstrap();
      expect(bootstrap).toMatchObject({
        today: "2026-10-08",
        schedules: [],
        works: [],
        ideas: [{ id: idea?.id }],
        accounts: [{ id: account.id }],
      });
      expect(bootstrap.paths).toHaveProperty("tasks");
      expect(bootstrap.pulls).toEqual([]);
      const backup = usecases.exportBackup();
      expect(backup.dir).toContain("export-");
      return import("node:fs").then(({ existsSync }) =>
        expect(existsSync(backup.dir)).toBe(true),
      );
    });
  });

  it("13. 脱敏覆盖密钥轮换后的代码异常、ask 和数据工具入库", async () => {
    const oldToken = "private-api-secret-2026";
    const oldClientSecret = "private-client-secret-2026";
    const rotatedToken = "rotated-api-secret-2026";
    const rotatedClientSecret = "rotated-client-secret-2026";
    const askToken = "ask-api-secret-2026";
    const askClientSecret = "ask-client-secret-2026";
    const latestToken = "latest-api-secret-2026";
    const latestClientSecret = "latest-client-secret-2026";
    let codeMode: "fail" | "ask" = "fail";
    let dataMode: "fail" | "success" = "fail";
    let rotateCodeSecrets: (() => void) | undefined;
    let rotateDataSecrets: (() => void) | undefined;
    const codeStep: CodeStepHandler = (ctx) => {
      const token = ctx.secret("analytics-token") ?? "missing-token";
      const clientSecret = ctx.secret("client-secret") ?? "missing-client";
      if (codeMode === "ask")
        return Promise.resolve({
          kind: "ask",
          ask: `请确认 ${token} ${clientSecret}`,
        });
      rotateCodeSecrets?.();
      return Promise.reject(new Error(`平台异常泄漏 ${token} ${clientSecret}`));
    };
    const dataTool: DataTool = {
      pull(ctx) {
        const token = ctx.secret("analytics-token") ?? "missing-token";
        const clientSecret = ctx.secret("client-secret") ?? "missing-client";
        if (dataMode === "fail")
          return Promise.resolve({
            ok: false,
            reason: `数据接口拒绝 ${token} ${clientSecret}`,
            fixHint: `轮换 ${token} ${clientSecret}`,
            expiredKey: "analytics-token",
          });
        rotateDataSecrets?.();
        return Promise.resolve({
          ok: true,
          result: {
            account: [],
            works: [],
            note: `读取结果 ${token} ${clientSecret}`,
          },
        });
      },
    };
    await withUseCases(
      async ({ usecases, app }) => {
        const account = addAccount(usecases, "多密钥账号", "blog", {
          "site-url": "https://site.example",
          "analytics-token": oldToken,
          "client-secret": oldClientSecret,
        });
        rotateCodeSecrets = () => {
          usecases.setSetting(account.id, "analytics-token", rotatedToken);
          usecases.setSetting(account.id, "client-secret", rotatedClientSecret);
        };
        const work = createWork(usecases, account.id, "轮换中的作品");
        const first = usecases.startWork({ id: work.id });
        if (!first.lease) throw new Error("没有租约");
        await writeFile(join(first.detail.folder, "稿子.md"), "稿子", "utf8");
        usecases.stepWork(work.id, first.lease.token);
        usecases.submitFeedback(work.id, "已发布 https://example.test/post");
        const resumed = usecases.startWork({ id: work.id });
        const failedRun = await usecases.runWork(
          work.id,
          resumed.lease?.token ?? "",
        );
        const taskFiles = await readdir(first.detail.folder);
        const taskContents = await Promise.all(
          taskFiles.map((name) =>
            readFile(join(first.detail.folder, name), "utf8"),
          ),
        );
        for (const secret of [oldToken, oldClientSecret]) {
          expect(JSON.stringify(failedRun)).not.toContain(secret);
          expect(JSON.stringify(app.store.works.get(work.id))).not.toContain(
            secret,
          );
          expect(taskContents.join("\n")).not.toContain(secret);
        }
        expect(failedRun.outcome).toMatchObject({
          kind: "fail",
          error: "内部错误：平台异常泄漏 <redacted> <redacted>",
        });

        const failedPull = await usecases.pullData({
          accountIds: [account.id],
        });
        expect(JSON.stringify(failedPull)).not.toContain(rotatedToken);
        expect(JSON.stringify(failedPull)).not.toContain(rotatedClientSecret);
        expect(JSON.stringify(app.store.pulls.latest())).not.toContain(
          rotatedToken,
        );
        expect(JSON.stringify(app.store.pulls.latest())).not.toContain(
          rotatedClientSecret,
        );
        expect(JSON.stringify(usecases.bootstrap())).not.toContain(
          rotatedToken,
        );
        expect(JSON.stringify(usecases.bootstrap())).not.toContain(
          rotatedClientSecret,
        );

        usecases.setSetting(account.id, "analytics-token", askToken);
        usecases.setSetting(account.id, "client-secret", askClientSecret);
        codeMode = "ask";
        const asked = await usecases.runWork(
          work.id,
          failedRun.lease?.token ?? "",
        );
        expect(asked.detail.work).toMatchObject({ status: "waiting" });
        expect(asked.detail.work.ask).toBe("请确认 <redacted> <redacted>");
        const askFile = await readFile(
          join(first.detail.folder, "要你做的事.md"),
          "utf8",
        );
        expect(askFile).not.toContain(askToken);
        expect(askFile).not.toContain(askClientSecret);

        dataMode = "success";
        rotateDataSecrets = () => {
          usecases.setSetting(account.id, "analytics-token", latestToken);
          usecases.setSetting(account.id, "client-secret", latestClientSecret);
        };
        const successfulPull = await usecases.pullData({
          accountIds: [account.id],
        });
        expect(JSON.stringify(successfulPull)).not.toContain(askToken);
        expect(JSON.stringify(successfulPull)).not.toContain(askClientSecret);
        const latestPull = app.store.pulls
          .latest()
          .find((record) => record.accountId === account.id);
        expect(latestPull?.note).toBe("读取结果 <redacted> <redacted>");
        expect(JSON.stringify(latestPull)).not.toContain(askToken);
        expect(JSON.stringify(latestPull)).not.toContain(askClientSecret);
        expect(JSON.stringify(usecases.bootstrap())).not.toContain(latestToken);
        expect(JSON.stringify(usecases.bootstrap())).not.toContain(
          latestClientSecret,
        );
      },
      { catalog: catalogWithMultipleSecrets(), codeStep, dataTool },
    );
  });
});
