import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliPath = join(repoRoot, "dist", "cli", "main.js");
const cliTimeout = 30_000;

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface M1Environment {
  home: string;
  baseUrl?: string;
  serverFirstLine?: string;
  close(): Promise<void>;
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export interface VersionResponse {
  seq: number;
  snapshotSeq: number;
  profilesStamp: number;
}

function command(home: string, args: readonly string[]): string[] {
  return [cliPath, ...args, "--home", home, "--json"];
}

export function parseJson<T>(text: string): T {
  const value: unknown = JSON.parse(text);
  return value as T;
}

export function runCli(home: string, args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, command(home, args), {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: cliTimeout,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error === undefined
      ? {}
      : { stderr: `${result.stderr}${result.error.message}` }),
  };
}

export function runCliChild(
  home: string,
  args: readonly string[],
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, command(home, args), {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, cliTimeout);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, timedOut });
    });
  });
}

function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  child.kill("SIGTERM");
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      child.off("exit", finish);
      resolve();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (child.exitCode !== null || child.signalCode !== null) finish();
      else child.once("exit", finish);
    }, 3_000);
    child.once("exit", finish);
  });
}

async function removeHome(home: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await rm(home, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        !["EBUSY", "EPERM", "ENOTEMPTY"].includes(String(error.code))
      ) {
        throw error;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("临时数据目录在 5 秒内无法释放", { cause: lastError });
}

async function startService(
  home: string,
): Promise<{ child: ChildProcess; url: string; firstLine: string }> {
  const child = spawn(
    process.execPath,
    [cliPath, "serve", "--home", home, "--port", "0", "--json"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => (stderr += chunk));

  const startup = await new Promise<{ url: string; firstLine: string }>(
    (resolve, reject) => {
      const output = createInterface({ input: child.stdout });
      const timer = setTimeout(() => fail(new Error("serve 启动超时")), 10_000);
      let firstLine: string | undefined;
      let accumulated = "";
      const fail = (error: Error): void => {
        clearTimeout(timer);
        output.close();
        reject(new Error(`${error.message}${stderr}`));
      };
      output.on("line", (line) => {
        firstLine ??= line;
        accumulated += `${line}\n`;
        try {
          const value: unknown = JSON.parse(accumulated);
          if (
            typeof value === "object" &&
            value !== null &&
            "ok" in value &&
            value.ok === true &&
            "url" in value &&
            typeof value.url === "string"
          ) {
            clearTimeout(timer);
            output.close();
            resolve({ url: value.url, firstLine: firstLine ?? line });
          }
        } catch {
          // The CLI currently emits pretty-printed JSON; keep reading until it is complete.
        }
      });
      child.once("error", fail);
      child.once("exit", (status) =>
        fail(new Error(`serve 提前退出：${status ?? "unknown"}`)),
      );
    },
  ).catch(async (error: unknown) => {
    await stopChild(child);
    throw error;
  });

  return { child, ...startup };
}

export async function createM1Environment(
  withServer: boolean,
): Promise<M1Environment> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-m1-"));
  let child: ChildProcess | undefined;
  try {
    const initialized = runCli(home, ["init"]);
    if (initialized.status !== 0) {
      throw new Error(`init 失败：${initialized.stderr}${initialized.stdout}`);
    }
    let baseUrl: string | undefined;
    let serverFirstLine: string | undefined;
    if (withServer) {
      const server = await startService(home);
      child = server.child;
      baseUrl = server.url;
      serverFirstLine = server.firstLine;
    }
    let closed = false;
    return {
      home,
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(serverFirstLine === undefined ? {} : { serverFirstLine }),
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        if (child !== undefined) await stopChild(child);
        await removeHome(home);
      },
    };
  } catch (error) {
    if (child !== undefined) await stopChild(child);
    await removeHome(home);
    throw error;
  }
}

export async function apiRequest<T>(
  environment: M1Environment,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  if (environment.baseUrl === undefined)
    throw new Error("此环境没有启动 HTTP 服务");
  const response = await fetch(new URL(path, environment.baseUrl), {
    method: options.method ?? "GET",
    headers: {
      Connection: "close",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const body: unknown = await response.json();
  return { status: response.status, body: body as T };
}

export async function getVersion(
  environment: M1Environment,
): Promise<VersionResponse> {
  const response = await apiRequest<VersionResponse>(
    environment,
    "/api/version",
  );
  if (response.status !== 200)
    throw new Error(`GET /api/version 返回 ${response.status}`);
  return response.body;
}
