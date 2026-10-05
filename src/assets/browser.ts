/** 按平台约定定位本机 Microsoft Edge 可执行文件。 */
import { existsSync } from "node:fs";
import { win32 } from "node:path";

export interface LocateEdgeOptions {
  readonly configuredPath?: string | undefined;
  readonly env?: Record<string, string | undefined> | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}

/** 返回首个存在的 Edge 路径；所有外部状态都可注入，便于无副作用测试。 */
export function locateEdge(
  options: LocateEdgeOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const candidates: string[] = [];

  if (options.configuredPath) candidates.push(options.configuredPath);

  if (platform === "win32") {
    for (const base of [
      env["ProgramFiles(x86)"],
      env["ProgramFiles"],
      env["LOCALAPPDATA"],
    ]) {
      if (base) {
        candidates.push(
          win32.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
        );
      }
    }
  } else if (platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else if (platform === "linux") {
    candidates.push(
      "/usr/bin/microsoft-edge",
      "/usr/bin/microsoft-edge-stable",
    );
  }

  return candidates.find((candidate) => exists(candidate));
}
