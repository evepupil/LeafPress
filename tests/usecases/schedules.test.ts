import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  writeScheduleState,
  type ScheduleState,
} from "../../src/schedule/state.js";
import { addAccount, blogSettings, withUseCases } from "./helpers.js";

const SUMMARY = "每天拉一次各账号的数据；拿数据的工具还没做的平台跳过。";

function installedState(
  dataPull: Partial<ScheduleState["dataPull"]> = {},
): ScheduleState {
  return {
    version: 1,
    dataPull: {
      installed: true,
      at: "07:30",
      installedAt: "2026-10-01T08:00:00+08:00",
      ...dataPull,
    },
  };
}

describe("定时拉数据的状态", () => {
  it("没装：bootstrap 带一项没装的拉数据，时间用配置里的默认值，接入里不写什么时候拉", async () => {
    await withUseCases(({ usecases, app }) => {
      const account = addAccount(usecases);

      expect(usecases.bootstrap().schedules).toEqual([
        {
          id: "data-pull",
          name: "拉作品数据",
          summary: SUMMARY,
          when: "每天 06:00",
          installed: false,
        },
      ]);
      expect(
        usecases.showAccount(account.id).setup.source.schedule,
      ).toBeUndefined();

      app.config = { ...app.config, schedule: { dataPullAt: "08:15" } };
      expect(usecases.bootstrap().schedules[0]?.when).toBe("每天 08:15");
    });
  });

  it("装了没跑过：带上装上的时间，没有运行记录；接入里写「每天 07:30」", async () => {
    await withUseCases(({ usecases, app }) => {
      const account = addAccount(usecases);
      writeScheduleState(app.paths, installedState());

      expect(usecases.bootstrap().schedules).toEqual([
        {
          id: "data-pull",
          name: "拉作品数据",
          summary: SUMMARY,
          when: "每天 07:30",
          installed: true,
          installedAt: "2026-10-01T08:00:00+08:00",
        },
      ]);
      expect(usecases.showAccount(account.id).setup.source.schedule).toBe(
        "每天 07:30",
      );
    });
  });

  it("装了且上次成功：带上上次运行的时间、结果和说明", async () => {
    await withUseCases(({ usecases, app }) => {
      writeScheduleState(
        app.paths,
        installedState({
          lastRunAt: "2026-10-08T07:30:12+08:00",
          lastResult: "ok",
          lastNote: "入库 3 个作品",
        }),
      );

      expect(usecases.bootstrap().schedules).toEqual([
        {
          id: "data-pull",
          name: "拉作品数据",
          summary: SUMMARY,
          when: "每天 07:30",
          installed: true,
          installedAt: "2026-10-01T08:00:00+08:00",
          lastRunAt: "2026-10-08T07:30:12+08:00",
          lastResult: "ok",
          lastNote: "入库 3 个作品",
        },
      ]);
    });
  });

  it("上次失败：失败的结果和说明原样带出", async () => {
    await withUseCases(({ usecases, app }) => {
      writeScheduleState(
        app.paths,
        installedState({
          lastRunAt: "2026-10-08T07:30:12+08:00",
          lastResult: "failed",
          lastNote: "博客：Umami 共享链接打不开了",
        }),
      );

      expect(usecases.bootstrap().schedules[0]).toMatchObject({
        installed: true,
        lastRunAt: "2026-10-08T07:30:12+08:00",
        lastResult: "failed",
        lastNote: "博客：Umami 共享链接打不开了",
      });
    });
  });

  it("卸下后不再显示什么时候拉，但留着上一轮的运行记录", async () => {
    await withUseCases(({ usecases, app }) => {
      const account = addAccount(usecases);
      writeScheduleState(
        app.paths,
        installedState({
          installed: false,
          lastRunAt: "2026-10-08T07:30:12+08:00",
          lastResult: "ok",
        }),
      );

      expect(usecases.bootstrap().schedules[0]).toMatchObject({
        installed: false,
        lastRunAt: "2026-10-08T07:30:12+08:00",
      });
      expect(
        usecases.showAccount(account.id).setup.source.schedule,
      ).toBeUndefined();
    });
  });

  it("状态文件坏了按没装算，不让取数据失败", async () => {
    await withUseCases(({ usecases, app }) => {
      writeFileSync(join(app.paths.home, "schedule.json"), "{写到一半", "utf8");

      expect(usecases.bootstrap().schedules).toEqual([
        {
          id: "data-pull",
          name: "拉作品数据",
          summary: SUMMARY,
          when: "每天 06:00",
          installed: false,
        },
      ]);
    });
  });

  it("运行说明里带着账号密钥时，bootstrap 会抹掉", async () => {
    const secret = "umami-share-secret-4096";
    await withUseCases(({ usecases, app, home }) => {
      addAccount(usecases, "博客", "blog", {
        ...blogSettings(home),
        "umami-share": secret,
      });
      writeScheduleState(
        app.paths,
        installedState({
          lastRunAt: "2026-10-08T07:30:12+08:00",
          lastResult: "failed",
          lastNote: `博客：共享链接 ${secret} 被拒绝`,
        }),
      );

      const bootstrap = usecases.bootstrap();
      expect(bootstrap.schedules[0]?.lastNote).toBe(
        "博客：共享链接 <redacted> 被拒绝",
      );
      expect(JSON.stringify(bootstrap)).not.toContain(secret);
    });
  });
});
