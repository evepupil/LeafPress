/**
 * 小红书代码步骤测试的公共夹具：临时任务文件夹 + 可注请求响应的 CodeStepContext。
 *
 * makeXhsFixture 建一个能直接交给步骤函数的 ctx（工作、账号按硬编码形状造、临时任务
 * 文件夹、假的 fetch），返回 folder 方便写稿子、读产物；close() 删掉临时文件夹。
 * 假的出图器 makeFakeRenderer 按卡片页数写几个字节的假 PNG。
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Account, DayKey, Work, WorkflowDef } from "@leafpress/core";

import type {
  CardDeckResult,
  CardRenderer,
} from "../../../src/platforms/xiaohongshu/cards/types.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";

/** 几个字节的假 PNG：只有文件头是真的，够内嵌和读文件用 */
const FAKE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

export interface XhsFixture {
  ctx: CodeStepContext;
  folder: string;
  /** 假 fetch 收到的请求 */
  requests: { url: string; redirect: string | undefined }[];
  /** 配置短链的跳转响应（按短链地址 → location 值） */
  setRedirects(redirects: Record<string, string>): void;
  writeFile(name: string, contents: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/** xhs-cards 工作流的硬编码定义：测试只用到编号和步骤名 */
function xhsWorkflow(): WorkflowDef {
  return {
    id: "xhs-cards",
    name: "图文卡片",
    platform: "xiaohongshu",
    from: "any",
    summary: "",
    steps: [
      { id: "draft", name: "写卡片稿和文案", kind: "ai" },
      { id: "render", name: "排版卡片", kind: "code" },
      { id: "publish", name: "你在手机上发", kind: "manual" },
      { id: "archive", name: "归档链接", kind: "code" },
    ],
    say: "",
    requires: [],
  };
}

function makeWork(options: {
  feedback?: string;
  feedbackHistory?: string[];
}): Work {
  return {
    id: "w1",
    title: "小红书测试作品",
    accountId: "xhs-1",
    status: "doing",
    brief: "",
    source: { kind: "none" },
    workflowId: "xhs-cards",
    step: 2,
    feedback: options.feedback,
    feedbackHistory: (options.feedbackHistory ?? []).map((text, index) => ({
      at: "2026-10-15T21:00:00+08:00",
      step: index,
      stepName: "你在手机上发",
      text,
    })),
    order: 0,
    createdAt: "2026-10-15T09:00:00+08:00",
    updatedAt: "2026-10-15T09:00:00+08:00",
    tags: [],
    log: [],
  };
}

/** 假的 fetch：短链按 setRedirects 配置回 302 + location，别的 404 */
function fakeFetch(state: XhsFixture): typeof fetch {
  const redirects = new Map<string, string>();
  state.setRedirects = (given) => {
    for (const [url, location] of Object.entries(given)) {
      redirects.set(url, location);
    }
  };
  return (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    state.requests.push({ url, redirect: init?.redirect });
    const location = redirects.get(url);
    if (location === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    return Promise.resolve(
      new Response(null, { status: 302, headers: { location } }),
    );
  };
}

export async function makeXhsFixture(
  options: {
    feedback?: string;
    feedbackHistory?: string[];
    today?: DayKey;
  } = {},
): Promise<XhsFixture> {
  const folder = await mkdtemp(join(tmpdir(), "xhs-step-"));
  const workflow = xhsWorkflow();
  const step = workflow.steps[3];
  if (!step) throw new Error("工作流步骤没配齐");
  const account: Account = {
    id: "xhs-1",
    platform: "xiaohongshu",
    name: "测试小红书",
    stage: "active",
    since: "2026-01-01",
    profile: "",
    profilePath: "/data/accounts/xhs-1.md",
    settings: [],
    createdAt: "2026-01-01T09:00:00+08:00",
    updatedAt: "2026-01-01T09:00:00+08:00",
  };
  const fixture: XhsFixture = {
    folder,
    requests: [],
    setRedirects: () => undefined,
    async writeFile(name, contents) {
      const path = join(folder, name);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, contents);
    },
    async close() {
      await rm(folder, { recursive: true, force: true });
    },
    ctx: {
      work: makeWork(options),
      account,
      workflow,
      step,
      folder,
      today: options.today ?? "2026-10-16",
      now: new Date("2026-10-16T09:00:00+08:00"),
      setting: () => undefined,
      secret: () => undefined,
      exec: () => Promise.reject(new Error("步骤不该调外部命令")),
      fetch: undefined as never,
      sleep: () => Promise.resolve(),
      heartbeat: () => undefined,
    },
  };
  fixture.ctx.fetch = fakeFetch(fixture);
  return fixture;
}

export interface FakeRenderer {
  renderer: CardRenderer;
  /** 出图器收到的调用 */
  calls: { pages: number; outDir: string; heartbeats: number }[];
  /** 让下一次出图抛错 */
  failWith(message: string): void;
}

/** 假的出图器：每页写一张几个字节的假 PNG，不真起浏览器 */
export function makeFakeRenderer(): FakeRenderer {
  const state: FakeRenderer = {
    calls: [],
    renderer: {
      async render(deck, outDir, options) {
        state.calls.push({
          pages: deck.pages.length,
          outDir,
          heartbeats: 0,
        });
        const call = state.calls[state.calls.length - 1];
        if (!call) throw new Error("记录出图调用失败");
        await mkdir(outDir, { recursive: true });
        for (let index = 1; index <= deck.pages.length; index += 1) {
          const name = `${String(index).padStart(2, "0")}.png`;
          await writeFile(join(outDir, name), FAKE_PNG);
          // 每张图都调一次心跳：正文里也要验证排版步骤把它递给出图器
          options?.heartbeat?.();
          call.heartbeats += 1;
        }
        return {
          files: deck.pages.map(
            (_, index) => `${String(index + 1).padStart(2, "0")}.png`,
          ),
          millis: 10,
        };
      },
    },
    failWith: () => undefined,
  };
  let failure: Error | undefined;
  const inner = state.renderer.render.bind(state.renderer);
  state.renderer.render = async (
    deck: Parameters<CardRenderer["render"]>[0],
    outDir: string,
    options?: Parameters<CardRenderer["render"]>[2],
  ) => {
    if (failure) throw failure;
    return inner(deck, outDir, options);
  };
  state.failWith = (message: string) => {
    failure = new Error(message);
  };
  return state;
}

/** 合格的卡片稿样例（3 页） */
export const GOOD_DECK = [
  "# 一句话勾住你",
  "副标题写在这里",
  "",
  "---",
  "",
  "## 第一个要点",
  "- 内容一",
  "- 内容二",
  "",
  "---",
  "",
  "## 总结：记住这三条",
  "- 复习一下",
  "",
].join("\n");

/** 合格的文案稿样例 */
export const GOOD_COPY = [
  "# 标题不超二十个字",
  "",
  "正文一行。",
  "再一行。",
  "",
  "#标签一 #标签二 #标签三",
].join("\n");

/** 检查结果里取卡片组（给需要直接喂出图器的测试用） */
export function deckOf(result: CardDeckResult): CardDeckResult {
  return result;
}
