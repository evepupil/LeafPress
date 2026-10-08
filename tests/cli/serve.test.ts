import { EventEmitter } from "node:events";
import type { RunningServer } from "../../src/server/serve.js";
import type { ExecFn } from "../../src/shared/exec.js";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeServe,
  openBrowser,
  renderServe,
  waitForSigint,
} from "../../src/cli/commands/serve.js";
import { describe, expect, it, vi } from "vitest";

function cast<T>(value: unknown): T {
  return value as T;
}

const successfulExec: ExecFn = () =>
  Promise.resolve({
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });

describe("serve", () => {
  it("把 port/dev 交给 startServer，并在需要时按 Windows 参数打开浏览器", async () => {
    const server = cast<RunningServer>({
      url: "http://127.0.0.1:4321/",
      close: vi.fn(() => Promise.resolve()),
    });
    const start = vi.fn(() => Promise.resolve(server));
    const exec = vi.fn(successfulExec);
    const context = createCliContext(
      { home: "C:/tmp/leafpress" },
      { env: {}, homedir: "C:/Users/test" },
    );
    const result = await executeServe(
      context,
      { port: "4321", dev: true, open: true },
      { start, exec },
    );
    expect(result).toEqual({ server, url: server.url });
    expect(renderServe(server.url)).toBe(
      "LeafPress 已启动：http://127.0.0.1:4321/（按 Ctrl+C 停止）",
    );
    expect(start).toHaveBeenCalledWith(
      { home: context.home, port: 4321, dev: true },
      expect.any(Function),
    );
    expect(exec).toHaveBeenCalledWith("cmd", ["/c", "start", "", server.url]);
  });

  it("在所有支持平台使用系统浏览器命令", async () => {
    const exec = vi.fn(successfulExec);
    await openBrowser("http://127.0.0.1:3210/", "darwin", exec);
    await openBrowser("http://127.0.0.1:3210/", "linux", exec);
    expect(exec.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ["open", ["http://127.0.0.1:3210/"]],
      ["xdg-open", ["http://127.0.0.1:3210/"]],
    ]);
  });

  it("SIGINT 等待服务关闭后才设退出码 130", async () => {
    const emitter = new EventEmitter();
    const order: string[] = [];
    const close = vi.fn(() => {
      order.push("close");
      return Promise.resolve();
    });
    const waiting = waitForSigint({ close }, emitter, (code) => {
      order.push(`exit-${code}`);
    });
    emitter.emit("SIGINT");
    await waiting;
    expect(close).toHaveBeenCalledOnce();
    expect(order).toEqual(["close", "exit-130"]);
    expect(emitter.listenerCount("SIGINT")).toBe(0);
  });

  it("拒绝无效端口", async () => {
    const context = createCliContext({}, { env: {}, homedir: "." });
    await expect(
      executeServe(
        context,
        { port: "65536", dev: false, open: false },
        { start: vi.fn() },
      ),
    ).rejects.toMatchObject({ code: "USAGE" });
  });
});
