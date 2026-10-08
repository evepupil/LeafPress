import type { UseCases } from "@leafpress/core";
import type { CliContext } from "../context.js";
import type { RunningServer, StartServerOptions } from "../../server/serve.js";
import type { ExecFn } from "../../shared/exec.js";
import { LeafPressError } from "../../shared/errors.js";
import { commandOptions, emitSuccess } from "./shared.js";

interface SignalTarget {
  once(event: "SIGINT", listener: () => void): unknown;
  removeListener(event: "SIGINT", listener: () => void): unknown;
}

export async function openBrowser(
  url: string,
  platform: NodeJS.Platform,
  exec: ExecFn,
): Promise<void> {
  if (platform === "win32") {
    await exec("cmd", ["/c", "start", "", url]);
    return;
  }
  await exec(platform === "darwin" ? "open" : "xdg-open", [url]);
}

export function waitForSigint(
  server: Pick<RunningServer, "close">,
  target: SignalTarget = process,
  setExitCode: (code: number) => void = (code) => {
    process.exitCode = code;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stopping = false;
    const onSignal = (): void => {
      if (stopping) return;
      stopping = true;
      void server.close().then(
        () => {
          target.removeListener("SIGINT", onSignal);
          setExitCode(130);
          resolve();
        },
        (error: unknown) => {
          target.removeListener("SIGINT", onSignal);
          reject(error instanceof Error ? error : new Error("服务启动失败"));
        },
      );
    };
    target.once("SIGINT", onSignal);
  });
}

export async function executeServe(
  context: CliContext,
  options: { port: string; open: boolean; dev: boolean },
  dependencies: {
    readonly start?: (
      options: StartServerOptions,
      factory: (home: string) => {
        usecases: UseCases;
        close(): void;
        logError(message: string): void;
      },
    ) => Promise<RunningServer>;
    readonly exec?: ExecFn;
  } = {},
): Promise<{ server: RunningServer; url: string }> {
  const port = Number(options.port);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new LeafPressError(
      "USAGE",
      `端口必须是 0 到 65535 之间的整数：${options.port}`,
    );
  }
  const startServer =
    dependencies.start ?? (await import("../../server/serve.js")).startServer;
  const [{ openApp, closeApp }, { createUseCases }] = await Promise.all([
    import("../../usecases/index.js"),
    import("../../usecases/create.js"),
  ]);
  const server = await startServer(
    { home: context.home, port, dev: options.dev },
    (home) => {
      const app = openApp({
        home,
        warn: (message) => process.stderr.write(`注意：${message}\n`),
      });
      return {
        usecases: createUseCases(app),
        close: () => closeApp(app),
        logError: (message) => process.stderr.write(`错误：${message}\n`),
      };
    },
  );
  try {
    if (options.open) {
      const exec =
        dependencies.exec ??
        context.exec ??
        (await import("../../shared/exec.js")).execCommand;
      await openBrowser(server.url, context.platform, exec);
    }
  } catch (error) {
    await server.close();
    throw error;
  }
  return { server, url: server.url };
}

export function renderServe(url: string): string {
  return `LeafPress 已启动：${url}（按 Ctrl+C 停止）`;
}

export async function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const options = commandOptions(args);
  const result = await executeServe(context, {
    port: typeof options["port"] === "string" ? options["port"] : "3210",
    open: options["open"] === true,
    dev: options["dev"] === true,
  });
  emitSuccess(context, { url: result.url }, renderServe(result.url));
  await waitForSigint(result.server);
}
