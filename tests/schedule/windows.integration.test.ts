import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildTaskXml } from "../../src/schedule/task-xml.js";
import { buildWrapperScript } from "../../src/schedule/wrapper.js";
import {
  installTask,
  queryTask,
  removeTask,
} from "../../src/schedule/windows.js";
import { execCommand } from "../../src/shared/exec.js";
import { REPLACEMENT_CHAR } from "./support.js";

const windowsOnly = process.platform !== "win32";

function nextBoundary(at: string, now: Date): string {
  const [hours, minutes] = at.split(":").map(Number);
  const boundary = new Date(now);
  boundary.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (boundary.getTime() <= now.getTime())
    boundary.setDate(boundary.getDate() + 1);
  const date = [
    boundary.getFullYear().toString().padStart(4, "0"),
    (boundary.getMonth() + 1).toString().padStart(2, "0"),
    boundary.getDate().toString().padStart(2, "0"),
  ].join("-");
  return `${date}T${at}:00`;
}

describe.skipIf(windowsOnly)("真实 Windows 计划任务注册", () => {
  it("注册随机测试任务、核对系统字段和 BOM，并在 finally 删除", async () => {
    const taskName = `LeafPressDataPullTest-${randomUUID()}`;
    const domain = process.env["USERDOMAIN"];
    const username = process.env["USERNAME"];
    if (domain === undefined || username === undefined)
      throw new Error("Windows 用户环境变量缺失");

    const directory = await mkdtemp(join(tmpdir(), "leafpress schedule real-"));
    const wrapperPath = join(directory, "run-data-pull.ps1");
    const entryPath = join(directory, "entry file.js");
    const nodePath = process.execPath;
    const at = "23:59";
    const now = new Date();
    const expectedStartBoundary = nextBoundary(at, now);
    let fields:
      | {
          enabled?: boolean;
          startBoundary?: string;
          startWhenAvailable?: boolean;
          runOnlyIfNetworkAvailable?: boolean;
          logonType?: string;
          home?: string;
          nodePath?: string;
          entryPath?: string;
          lastResult?: number;
          lastRunAt?: string;
        }
      | undefined;
    let didInstall = false;

    try {
      const xml = buildTaskXml({
        at,
        now,
        userId: `${domain}\\${username}`,
        wrapperPath,
        workingDirectory: directory,
      });
      await writeFile(
        wrapperPath,
        `\uFEFF${buildWrapperScript({ nodePath, entryPath, homePath: directory })}`,
        "utf8",
      );
      const wrapperBytes = await readFile(wrapperPath);
      expect(wrapperBytes.subarray(0, 3)).toEqual(
        Buffer.from([0xef, 0xbb, 0xbf]),
      );

      await installTask({ xml, exec: execCommand, taskName });
      didInstall = true;
      const task = await queryTask({ exec: execCommand, taskName });
      fields = task;
      expect(task.installed).toBe(true);
      expect(task.enabled).toBe(true);
      expect(task.startBoundary).toBe(expectedStartBoundary);
      expect(task.startWhenAvailable).toBe(true);
      expect(task.runOnlyIfNetworkAvailable).toBe(true);
      expect(task.logonType).toMatch(/Interactive/);
      expect(task.home).toBe(directory);
      expect(task.nodePath).toBe(nodePath);
      expect(task.entryPath).toBe(entryPath);
      if (task.lastResult === 267011) expect(task.lastRunAt).toBeUndefined();
    } finally {
      const deletion = await execCommand("schtasks.exe", [
        "/Delete",
        "/TN",
        taskName,
        "/F",
      ]);
      const queryArgs = ["/Query", "/TN", taskName] as const;
      const verification = await execCommand("schtasks.exe", queryArgs);
      expect(verification.exitCode).not.toBe(0);
      if (didInstall) expect(deletion.exitCode).toBe(0);
      console.info(
        "真实计划任务验证",
        JSON.stringify({
          taskName,
          fields,
          deletion: {
            command: ["schtasks.exe", "/Delete", "/TN", taskName, "/F"],
            exitCode: deletion.exitCode,
            stdout: deletion.stdout,
            stderr: deletion.stderr,
          },
          verification: {
            command: ["schtasks.exe", ...queryArgs],
            exitCode: verification.exitCode,
            stdout: verification.stdout,
            stderr: verification.stderr,
          },
        }),
      );
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("注册不合法的 XML：错误里带系统给的原因，没有乱码，也不留任务", async () => {
    const taskName = `LeafPressDataPullTest-${randomUUID()}`;
    try {
      const message = await installTask({
        xml: "<Task>oops</Task>",
        exec: execCommand,
        taskName,
      }).then(
        () => "注册竟然成功了",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error),
      );
      console.info("注册不合法 XML 的错误信息：", message);

      const prefix = "注册计划任务失败：";
      expect(message.startsWith(prefix)).toBe(true);
      const reason = message.slice(prefix.length);
      // 中英文系统给的原因里都会提到「任务 XML」
      expect(reason).toContain("XML");
      expect(Array.from(reason).length).toBeLessThanOrEqual(300);
      // schtasks 按系统代码页（中文系统是 GBK）输出，按 UTF-8 硬解会出现 U+FFFD
      expect(message).not.toContain(REPLACEMENT_CHAR);
      await expect(queryTask({ exec: execCommand, taskName })).resolves.toEqual(
        { installed: false },
      );
    } finally {
      await execCommand("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
    }
  }, 60_000);

  it("注册后用 removeTask 卸载：系统里不再有这个任务", async () => {
    const taskName = `LeafPressDataPullTest-${randomUUID()}`;
    const domain = process.env["USERDOMAIN"];
    const username = process.env["USERNAME"];
    if (domain === undefined || username === undefined)
      throw new Error("Windows 用户环境变量缺失");
    const directory = await mkdtemp(join(tmpdir(), "leafpress schedule rm-"));
    try {
      const xml = buildTaskXml({
        at: "23:59",
        now: new Date(),
        userId: `${domain}\\${username}`,
        wrapperPath: join(directory, "run-data-pull.ps1"),
        workingDirectory: directory,
      });
      await installTask({ xml, exec: execCommand, taskName });

      await expect(
        removeTask({ exec: execCommand, taskName }),
      ).resolves.toEqual({
        removed: true,
      });
      await expect(queryTask({ exec: execCommand, taskName })).resolves.toEqual(
        { installed: false },
      );
    } finally {
      await execCommand("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("查不存在的任务：系统明确说没有才算没装，任务名带弯引号也能解析", async () => {
    const curly = String.fromCodePoint(0x2019);
    for (const taskName of [
      `LeafPressDataPullTest-${randomUUID()}`,
      `LeafPressDataPullTest-it${curly}s-${randomUUID()}`,
    ]) {
      await expect(queryTask({ exec: execCommand, taskName })).resolves.toEqual(
        { installed: false },
      );
    }
  }, 60_000);
});
