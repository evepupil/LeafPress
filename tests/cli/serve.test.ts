import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunningServer } from "../../src/server/serve.js";
import type { ExecFn } from "../../src/shared/exec.js";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeServe,
  openBrowser,
  renderServe,
  renderServeJson,
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

  it("SIGINT 等待服务关闭后以正常退出码结束", async () => {
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
    expect(order).toEqual(["close", "exit-0"]);
    expect(emitter.listenerCount("SIGINT")).toBe(0);
  });

  it("未指定端口时使用默认或配置的服务端口", async () => {
    const temp = await mkdtemp(join(tmpdir(), "leafpress-cli-serve-port-"));
    try {
      const defaultContext = createCliContext(
        { home: join(temp, "default") },
        { env: {}, homedir: temp },
      );
      const defaultStart = vi.fn(() =>
        Promise.resolve(
          cast<RunningServer>({
            url: "http://127.0.0.1:3210/",
            close: vi.fn(() => Promise.resolve()),
          }),
        ),
      );
      await executeServe(
        defaultContext,
        { dev: false, open: false },
        { start: defaultStart },
      );
      expect(defaultStart).toHaveBeenCalledWith(
        expect.objectContaining({ port: 3210 }),
        expect.any(Function),
      );

      const configuredHome = join(temp, "configured");
      await mkdir(configuredHome, { recursive: true });
      await writeFile(
        join(configuredHome, "config.json"),
        JSON.stringify({ version: 2, server: { port: 4321 } }),
        "utf8",
      );
      const configuredContext = createCliContext(
        { home: configuredHome },
        { env: {}, homedir: temp },
      );
      const configuredStart = vi.fn(() =>
        Promise.resolve(
          cast<RunningServer>({
            url: "http://127.0.0.1:4321/",
            close: vi.fn(() => Promise.resolve()),
          }),
        ),
      );
      await executeServe(
        configuredContext,
        { dev: false, open: false },
        { start: configuredStart },
      );
      expect(configuredStart).toHaveBeenCalledWith(
        expect.objectContaining({ port: 4321 }),
        expect.any(Function),
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("serve JSON 是单行输出", () => {
    expect(renderServeJson("http://127.0.0.1:3210/")).toBe(
      '{"ok":true,"url":"http://127.0.0.1:3210/"}\n',
    );
  });

  it("严格校验端口十进制格式和范围，同时允许系统分配端口", async () => {
    const context = createCliContext({}, { env: {}, homedir: "." });
    const start = vi.fn(() =>
      Promise.resolve(
        cast<RunningServer>({
          url: "http://127.0.0.1:0/",
          close: vi.fn(() => Promise.resolve()),
        }),
      ),
    );
    for (const port of ["1e3", "+3210", " 3210", "1023", "65536", "-1"]) {
      await expect(
        executeServe(context, { port, dev: false, open: false }, { start }),
      ).rejects.toMatchObject({ code: "USAGE" });
    }
    const result = await executeServe(
      context,
      { port: "0", dev: false, open: false },
      { start },
    );
    expect(result.server).toBeDefined();
    expect(start).toHaveBeenCalledWith(
      { home: context.home, port: 0, dev: false },
      expect.any(Function),
    );
  });
});
