import { createServer as createTcpServer } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import type { UseCases } from "@leafpress/core";

import { createServerApp } from "./app.js";
import { defaultWebRoot } from "./static.js";
import { LeafPressError } from "../shared/errors.js";

export interface StartServerOptions {
  home: string;
  port?: number;
  dev?: boolean;
  webRoot?: string;
}

export interface UseCasesFactoryResult {
  usecases: UseCases;
  close(): void;
  logError(message: string): void;
}

export type CreateUseCases = (home: string) => UseCasesFactoryResult;

export interface RunningServer {
  url: string;
  address: string;
  close(): Promise<void>;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error))
    return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function reservePort(): Promise<number> {
  const probe = createTcpServer();
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    probe.once("error", onError);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.off("error", onError);
      if (address === null || typeof address === "string") {
        probe.close();
        reject(new Error("无法获取本机空闲端口。"));
        return;
      }
      probe.close((error) =>
        error === undefined ? resolve(address.port) : reject(error),
      );
    });
  });
}

function closeAllConnections(server: ServerType): void {
  if (
    "closeAllConnections" in server &&
    typeof server.closeAllConnections === "function"
  ) {
    server.closeAllConnections();
  }
}

function logSafely(logError: (message: string) => void, error: unknown): void {
  try {
    logError(error instanceof Error ? error.message : String(error));
  } catch {
    // A logging failure must not affect the server lifecycle.
  }
}

export async function startServer(
  options: StartServerOptions,
  createUseCases: CreateUseCases,
): Promise<RunningServer> {
  const factory = createUseCases(options.home);
  const requestedPort = options.port ?? 3210;
  const port = requestedPort === 0 ? await reservePort() : requestedPort;
  const app = createServerApp({
    usecases: factory.usecases,
    port,
    webRoot: options.webRoot ?? defaultWebRoot(),
    dev: options.dev,
    logError: (message) => factory.logError(message),
  });

  let server: ServerType | undefined;
  let boundAddress: string;
  try {
    server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
    const listeningServer = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      const onListening = (): void => {
        listeningServer.off("error", onError);
        resolve();
      };
      listeningServer.once("error", onError);
      listeningServer.once("listening", onListening);
    });
    const address = listeningServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("无法获取本机服务监听地址。");
    }
    boundAddress = address.address;
  } catch (error) {
    const failedServer = server;
    if (failedServer !== undefined) {
      closeAllConnections(failedServer);
      await new Promise<void>((resolve) => failedServer.close(() => resolve()));
    }
    factory.close();
    if (errorCode(error) === "EADDRINUSE") {
      throw new LeafPressError(
        "USAGE",
        `端口 ${port} 被占用：可能已经开着了，直接打开 http://127.0.0.1:${port}/`,
        { cause: error },
      );
    }
    throw error;
  }

  if (server === undefined) {
    factory.close();
    throw new Error("本机服务未创建。");
  }
  server.on("error", (error: Error) =>
    logSafely((message) => factory.logError(message), error),
  );
  let closePromise: Promise<void> | undefined;
  return {
    url: `http://127.0.0.1:${port}/`,
    address: boundAddress,
    close(): Promise<void> {
      closePromise ??= new Promise<void>((resolve, reject) => {
        const shutdownTimer = setTimeout(
          () => closeAllConnections(server),
          2_000,
        );
        server.close((error?: Error) => {
          clearTimeout(shutdownTimer);
          if (error === undefined) resolve();
          else reject(error);
        });
      }).finally(() => factory.close());
      return closePromise;
    },
  };
}
