import { describe, expect, it } from "vitest";

import type { ExecFn, ExecResult } from "../../src/shared/exec.js";
import { openFolder } from "../../src/files/open-folder.js";
import { LeafPressError } from "../../src/shared/errors.js";

const success: ExecResult = {
  stdout: "",
  stderr: "",
  exitCode: 0,
  timedOut: false,
};

describe("openFolder", () => {
  it("按系统选择文件管理器命令和参数", async () => {
    const calls: Array<[string, readonly string[]]> = [];
    const exec: ExecFn = (command, args) => {
      calls.push([command, args]);
      return Promise.resolve(success);
    };

    await openFolder(exec, "C:/data files", "win32");
    await openFolder(exec, "/tmp/data", "darwin");
    await openFolder(exec, "/tmp/data", "linux");
    expect(calls).toEqual([
      ["explorer.exe", ["C:/data files"]],
      ["open", ["/tmp/data"]],
      ["xdg-open", ["/tmp/data"]],
    ]);
  });

  it("Windows explorer.exe 退出码 1 视作成功", async () => {
    const exec: ExecFn = () => Promise.resolve({ ...success, exitCode: 1 });
    await expect(
      openFolder(exec, "C:/leafpress", "win32"),
    ).resolves.toBeUndefined();
  });

  it("macOS 和 Linux 的非零退出码或超时报告 STORE_FAILED", async () => {
    const failed: ExecFn = () => Promise.resolve({ ...success, exitCode: 1 });
    await expect(
      openFolder(failed, "/tmp/data", "darwin"),
    ).rejects.toMatchObject({
      code: "STORE_FAILED",
    });
    const timedOut: ExecFn = () =>
      Promise.resolve({ ...success, timedOut: true });
    await expect(
      openFolder(timedOut, "/tmp/data", "linux"),
    ).rejects.toBeInstanceOf(LeafPressError);
  });
});
