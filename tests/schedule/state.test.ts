import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { homePaths } from "../../src/config/home.js";
import {
  readScheduleState,
  recordScheduledRun,
  writeScheduleState,
} from "../../src/schedule/state.js";
import type { ScheduleState } from "../../src/schedule/state.js";

let home = "";

afterEach(async () => {
  if (home !== "") await rm(home, { recursive: true, force: true });
  home = "";
});

async function makeHome(): Promise<ReturnType<typeof homePaths>> {
  home = await mkdtemp(join(tmpdir(), "leafpress-schedule-state-"));
  return homePaths(home);
}

describe("schedule state file", () => {
  it("未存在时返回指定默认时间", async () => {
    const paths = await makeHome();
    expect(readScheduleState(paths, "07:30")).toEqual({
      version: 1,
      dataPull: { installed: false, at: "07:30" },
    });
  });

  it("写入并读取安装状态", async () => {
    const paths = await makeHome();
    const state: ScheduleState = {
      version: 1,
      dataPull: {
        installed: true,
        at: "06:00",
        installedAt: "2026-10-09T09:30:00+08:00",
      },
    };

    writeScheduleState(paths, state);
    expect(readScheduleState(paths, "07:00")).toEqual(state);
    expect(await readFile(join(home, "schedule.json"), "utf8")).toContain(
      '"installed": true',
    );
  });

  it.each([
    "{",
    '{"version":2}',
    '{"version":1,"dataPull":{"installed":1}}',
    '{"version":1,"dataPull":{"installed":false,"at":"06:00","installedAt":"bad-time"}}',
  ])("坏文件按未安装状态返回：%s", async (contents) => {
    const paths = await makeHome();
    await writeFile(join(home, "schedule.json"), contents, "utf8");

    expect(readScheduleState(paths, "07:00")).toEqual({
      version: 1,
      dataPull: { installed: false, at: "07:00" },
    });
  });

  it("记录最近一次定时运行的三个字段并保留安装信息", async () => {
    const paths = await makeHome();
    writeScheduleState(paths, {
      version: 1,
      dataPull: {
        installed: true,
        at: "05:45",
        installedAt: "2026-10-08T12:00:00+08:00",
      },
    });

    recordScheduledRun(paths, {
      at: "2026-10-09T06:00:12+08:00",
      result: "failed",
      note: "有一个账号拉取失败",
    });

    expect(readScheduleState(paths, "07:00")).toEqual({
      version: 1,
      dataPull: {
        installed: true,
        at: "05:45",
        installedAt: "2026-10-08T12:00:00+08:00",
        lastRunAt: "2026-10-09T06:00:12+08:00",
        lastResult: "failed",
        lastNote: "有一个账号拉取失败",
      },
    });
  });
});
