import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { EdgeProcess } from "./edge-process.js";

/** Node 24 自带 WebSocket，不用引依赖 */
type CdpMessage = {
  id?: number;
  method?: string;
  error?: unknown;
  result?: unknown;
};
const CDP_REQUEST_TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event: MessageEvent) => {
      const raw: unknown = event.data;
      if (typeof raw !== "string") return;
      let message: CdpMessage;
      try {
        message = JSON.parse(raw) as CdpMessage;
      } catch {
        return;
      }
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error)
        waiter.reject(new Error(`命令失败: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
    });
    ws.addEventListener("close", () => {
      for (const [id, waiter] of this.pending) {
        this.pending.delete(id);
        clearTimeout(waiter.timer);
        waiter.reject(new Error("调试协议连接已关闭"));
      }
    });
  }

  rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`调试协议请求超时: ${method}`));
      }, CDP_REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async close(): Promise<void> {
    try {
      await Promise.race([this.rpc("Browser.close"), sleep(2_000)]);
    } catch {
      // 协议关不掉就走进程清理
    }
    try {
      this.ws.close();
    } catch {
      // 已经断了就不用管
    }
  }
}

export async function connectToEdge(
  edge: EdgeProcess,
  userDir: string,
  deadline: number,
): Promise<CdpSession> {
  let wsUrl: string | null = null;
  while (wsUrl === null && Date.now() < deadline) {
    try {
      const port = readFileSync(join(userDir, "DevToolsActivePort"), "utf8")
        .split("\n")[0]
        ?.trim();
      if (port && /^\d+$/.test(port)) wsUrl = `http://127.0.0.1:${port}`;
    } catch {
      // 文件还没写出来，再等一轮
    }
    const match = edge.stderrText().match(/DevTools listening on (ws:\/\/\S+)/);
    if (wsUrl === null && match?.[1]) wsUrl = match[1];
    if (wsUrl === null) await sleep(200);
  }
  if (wsUrl === null) throw new Error("Edge 的调试端口没起来");

  let pageWs: string | null = wsUrl.startsWith("ws://") ? wsUrl : null;
  for (let attempt = 0; pageWs === null && attempt < 50; attempt++) {
    try {
      const response = await fetch(`${wsUrl}/json/list`);
      const pages = (await response.json()) as {
        type: string;
        webSocketDebuggerUrl?: string;
      }[];
      pageWs =
        pages.find((page) => page.type === "page" && page.webSocketDebuggerUrl)
          ?.webSocketDebuggerUrl ?? null;
    } catch {
      // 端口刚开还没就绪，再等一轮
    }
    if (pageWs === null) await sleep(200);
  }
  if (pageWs === null) throw new Error("Edge 起来了但拿不到页面的调试地址");

  const ws = new WebSocket(pageWs);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("连调试协议超时")),
        10_000,
      );
      const settle = (handler: () => void) => () => {
        clearTimeout(timer);
        handler();
      };
      ws.addEventListener("open", settle(resolve), { once: true });
      ws.addEventListener(
        "error",
        settle(() => reject(new Error("连调试协议失败"))),
        { once: true },
      );
    });
  } catch {
    throw new Error("连不上 Edge 的调试协议");
  }
  return new CdpSession(ws);
}

export async function evaluate(
  session: CdpSession,
  body: string,
): Promise<unknown> {
  type EvalResult = {
    result?: { value?: unknown };
    exceptionDetails?: { exception?: { description?: string } };
  };
  const response = (await session.rpc("Runtime.evaluate", {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  })) as EvalResult;
  if (response.exceptionDetails) {
    throw new Error(
      (
        response.exceptionDetails.exception?.description ??
        JSON.stringify(response.exceptionDetails)
      ).slice(0, 300),
    );
  }
  return response.result?.value;
}
