import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Child = {
  pid?: number;
  exitCode: number | null;
  signalCode: string | null;
  stderr: { on(ev: "data", fn: (chunk: Buffer) => void): void };
};

export interface EdgeProcess {
  child: Child;
  stderrText(): string;
}

export function startEdgeProcess(
  edgeExe: string,
  userDir: string,
): EdgeProcess {
  const child = spawn(
    edgeExe,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDir}`,
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  ) as unknown as Child;

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  return { child, stderrText: () => stderr };
}

async function killEdgeTree(child: Child, userDir: string): Promise<void> {
  if (process.platform !== "win32") {
    if (
      child.pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch {
        // 已经退了就不用管
      }
    }
    return;
  }

  const failures: string[] = [];
  const kill = (pid: number) => {
    const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 20_000,
      windowsHide: true,
    });
    if (result.error) failures.push(result.error.message);
    else if (result.status !== 0)
      failures.push(`taskkill 退出码 ${result.status}`);
  };
  if (child.pid !== undefined) kill(child.pid);

  const escapedDir = userDir.replaceAll("'", "''");
  const script =
    `$dir = '${escapedDir}'; ` +
    "Get-CimInstance Win32_Process | " +
    "Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine.Contains($dir) } | " +
    "ForEach-Object { $_.ProcessId }";
  const getPids = (): number[] => {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 20_000,
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0) {
      throw new Error(
        `确认 Edge 进程失败：${result.error?.message ?? result.stderr}`,
      );
    }
    return result.stdout
      .trim()
      .split(/\r?\n/)
      .filter((id) => /^\d+$/.test(id))
      .map(Number);
  };

  for (let attempt = 0; attempt < 10; attempt++) {
    const pids = getPids();
    if (pids.length === 0) return;
    for (const pid of pids) kill(pid);
    await sleep(100);
  }
  const remaining = getPids();
  if (remaining.length > 0) {
    throw new Error(
      `Edge 进程未退出：${remaining.join(", ")}；${failures.join("；")}`,
    );
  }
}

async function rmUserDir(userDir: string, bestEffort: boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      rmSync(userDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 29 && !bestEffort) throw error;
      await sleep(100);
    }
  }
}

export async function cleanupEdgeProcess(
  edge: EdgeProcess | null,
  userDir: string,
  bestEffort: boolean,
): Promise<void> {
  let killError: Error | undefined;
  if (edge) {
    try {
      await killEdgeTree(edge.child, userDir);
    } catch (error) {
      killError = error instanceof Error ? error : new Error(String(error));
    }
  }
  await rmUserDir(userDir, bestEffort);
  if (killError && !bestEffort) throw killError;
}
