import { Agent, request as httpRequest } from "node:http";
import { connect, isIPv4, type Socket } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AddAccountInput,
  AddIdeaInput,
  CreateWorksInput,
} from "@leafpress/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  startServer,
  type CreateUseCases,
  type RunningServer,
} from "../../src/server/serve.js";
import {
  accountFixture,
  bootstrapFixture,
  createFakeUseCases,
  ideaFixture,
  versionFixture,
  workFixture,
  type FakeUseCases,
} from "./fake-usecases.js";

let tempDir: string | undefined;
let running: RunningServer | undefined;

function requestWithHost(url: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: { host } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.end();
  });
}

function otherIpv4Address(): string | undefined {
  return Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .find((info) => !info.internal && isIPv4(info.address))?.address;
}

function canConnectTo(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, host);
    let settled = false;
    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function openSocketWithoutRequest(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });
}

afterEach(async () => {
  if (running !== undefined) {
    await running.close();
    running = undefined;
  }
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function memoryUseCases(): FakeUseCases {
  const usecases = createFakeUseCases();
  let sequence = versionFixture.seq;
  const accounts: typeof bootstrapFixture.accounts = [];
  const ideas: typeof bootstrapFixture.ideas = [];
  const works: typeof bootstrapFixture.works = [];
  usecases.version = vi.fn(() => ({ ...versionFixture, seq: sequence }));
  usecases.addAccount = vi.fn((input: AddAccountInput) => {
    sequence += 1;
    const account = {
      ...accountFixture,
      platform: input.platform,
      name: input.name,
    };
    accounts.push(account);
    return account;
  });
  usecases.addIdeas = vi.fn((inputs: AddIdeaInput[]) => {
    sequence += 1;
    const result = inputs.map((input) => ({
      ...ideaFixture,
      text: input.text,
      detail: input.detail ?? "",
      source: input.source,
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      ...(input.sourceDetail === undefined
        ? {}
        : { sourceDetail: input.sourceDetail }),
    }));
    ideas.push(...result);
    return result;
  });
  usecases.createWorks = vi.fn((input: CreateWorksInput) => {
    sequence += 1;
    const work = {
      ...workFixture,
      accountId: input.accountIds[0] ?? workFixture.accountId,
      title:
        input.source.kind === "new" ? input.source.title : workFixture.title,
      brief: input.brief,
    };
    works.push(work);
    return [work];
  });
  usecases.bootstrap = vi.fn(() => ({
    ...bootstrapFixture,
    version: { ...versionFixture, seq: sequence },
    accounts: [...accounts],
    ideas: [...ideas],
    works: [...works],
  }));
  return usecases;
}

describe("真实 HTTP 服务集成（内存 UseCases）", () => {
  it("绑定本机端口并覆盖写入路由、guard、静态托管和端口占用", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-server-integration-"));
    const home = join(tempDir, "home");
    const webRoot = join(tempDir, "web");
    await mkdir(webRoot, { recursive: true });
    await writeFile(join(webRoot, "index.html"), "integration page");
    const instances: FakeUseCases[] = [];
    let closed = 0;
    const factory: CreateUseCases = () => {
      const usecases = memoryUseCases();
      instances.push(usecases);
      return {
        usecases,
        close: () => (closed += 1),
        logError: () => undefined,
      };
    };

    running = await startServer({ home, port: 0, dev: true, webRoot }, factory);
    const baseUrl = running.url;
    const port = Number(new URL(baseUrl).port);
    expect(running.address).toBe("127.0.0.1");
    const alternateAddress = otherIpv4Address();
    if (alternateAddress !== undefined) {
      expect(await canConnectTo(alternateAddress, port)).toBe(false);
    }
    const accountResponse = await fetch(`${baseUrl}api/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "zhihu",
        name: "知乎账号",
        intro: "账号简介",
      }),
    });
    const ideaResponse = await fetch(`${baseUrl}api/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "灵感内容", source: "quick" }),
    });
    const workResponse = await fetch(`${baseUrl}api/works`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: { kind: "idea", ideaId: "idea-1" },
        accountIds: ["zhihu-1"],
        brief: "写一篇",
      }),
    });
    const bootstrapResponse = await fetch(`${baseUrl}api/bootstrap`);
    const versionResponse = await fetch(`${baseUrl}api/version`);
    const pageResponse = await fetch(baseUrl);
    const blockedHostStatus = await requestWithHost(
      `${baseUrl}api/version`,
      "attacker.test",
    );
    const preflight = await fetch(`${baseUrl}api/version`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3211",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(accountResponse.status).toBe(200);
    expect(ideaResponse.status).toBe(200);
    expect(workResponse.status).toBe(200);
    expect(await bootstrapResponse.json()).toMatchObject({
      accounts: [{ ...accountFixture, name: "知乎账号" }],
      ideas: [{ ...ideaFixture, text: "灵感内容" }],
      works: [{ ...workFixture, brief: "写一篇" }],
    });
    const versionText = await versionResponse.text();
    expect(versionText).toContain(`"seq":${versionFixture.seq + 3}`);
    expect(await pageResponse.text()).toBe("integration page");
    expect(blockedHostStatus).toBe(403);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3211",
    );
    expect(instances[0]?.addAccount).toHaveBeenCalledWith({
      platform: "zhihu",
      name: "知乎账号",
      intro: "账号简介",
    });
    expect(instances[0]?.addIdeas).toHaveBeenCalledWith([
      { text: "灵感内容", source: "quick" },
    ]);
    expect(instances[0]?.createWorks).toHaveBeenCalledWith({
      source: { kind: "idea", ideaId: "idea-1" },
      accountIds: ["zhihu-1"],
      brief: "写一篇",
    });

    await expect(
      startServer({ home, port, webRoot }, factory),
    ).rejects.toMatchObject({
      code: "USAGE",
      message: `端口 ${port} 被占用：可能已经开着了，直接打开 http://127.0.0.1:${port}/`,
    });
    expect(closed).toBe(1);
  });

  it("在 3 秒内关闭空闲长连接和未发送请求的连接", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-server-shutdown-"));
    let closed = 0;
    const factory: CreateUseCases = () => ({
      usecases: createFakeUseCases(),
      close: () => {
        closed += 1;
      },
      logError: () => undefined,
    });
    running = await startServer(
      { home: join(tempDir, "home"), port: 0 },
      factory,
    );
    const serverToClose = running;
    const baseUrl = running.url;
    const port = Number(new URL(baseUrl).port);
    const keepAliveAgent = new Agent({ keepAlive: true });
    let unsentSocket: Socket | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest(
          baseUrl,
          { agent: keepAliveAgent },
          (response) => {
            response.resume();
            response.once("end", resolve);
          },
        );
        request.once("error", reject);
        request.end();
      });
      unsentSocket = await openSocketWithoutRequest(port);
      const startedAt = Date.now();
      await serverToClose.close();
      running = undefined;

      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(closed).toBe(1);
      const pendingSocket = unsentSocket;
      if (!pendingSocket.destroyed) {
        await new Promise<void>((resolve) =>
          pendingSocket.once("close", () => resolve()),
        );
      }
      expect(pendingSocket.destroyed).toBe(true);
    } finally {
      keepAliveAgent.destroy();
      unsentSocket?.destroy();
    }
  }, 10_000);
});
