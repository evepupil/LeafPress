import { LeafPressError } from "../shared/errors.js";
import type { ExecFn } from "../shared/exec.js";

export async function openFolder(
  exec: ExecFn,
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const command =
    platform === "win32"
      ? "explorer.exe"
      : platform === "darwin"
        ? "open"
        : "xdg-open";
  const result = await exec(command, [path]);
  if (platform !== "win32" && (result.exitCode !== 0 || result.timedOut)) {
    throw new LeafPressError("STORE_FAILED", `打开文件夹失败：${path}`);
  }
}
