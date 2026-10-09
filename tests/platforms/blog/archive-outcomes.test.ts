/**
 * 归档把访问文章地址的结果分开说：连不上、404（还没上线）、别的状态码。
 * 站点地址写成 blog.chaosyn.com（没写 https://）时，推送成功、文章也上线了，
 * 归档却每次都回「还没上线」，作品永远结束不了——所以站点地址的格式在一开始就要拦下。
 */
import type { CodeOutcome } from "@leafpress/core";
import { describe, expect, it } from "vitest";

import { createBlogArchiveHandler } from "../../../src/platforms/blog/steps/archive.js";
import { blogStepConfig } from "../../../src/platforms/blog/steps/config.js";
import { gateBlogDraft } from "../../../src/platforms/blog/steps/gate.js";
import { publishBlogDraft } from "../../../src/platforms/blog/steps/publish.js";
import { type BlogFixture, makeBlogFixture } from "./steps-fixtures.js";

const SITE = "https://blog.example.test";
const FORMAT_ERROR = "站点地址的格式不对：要以 https:// 开头";

type Reply = number | Error;

/** 假的网络请求和等待：按顺序回应，用完后一直回最后一个；等待只记数，不真等 */
function stubs(...replies: Reply[]) {
  const requests: string[] = [];
  const sleeps: number[] = [];
  return {
    requests,
    sleeps,
    fetch: ((input: string | URL | Request) => {
      requests.push(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
      if (reply === undefined) return Promise.reject(new Error("没有预设"));
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve(new Response("正文", { status: reply }));
    }) as typeof fetch,
    sleep: (ms: number): Promise<void> => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  };
}

async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
  settings: Record<string, string | undefined> = {},
): Promise<void> {
  const fixture = await makeBlogFixture({ withRepo: false, settings });
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

async function archive(
  fixture: BlogFixture,
  net: ReturnType<typeof stubs>,
): Promise<CodeOutcome> {
  return createBlogArchiveHandler({ fetch: net.fetch, sleep: net.sleep })(
    fixture.ctx,
  );
}

describe("站点地址的格式", () => {
  const context = (site: string) => ({
    setting: (key: string) =>
      key === "repo-path" ? "/repo" : key === "site-url" ? site : undefined,
    secret: () => undefined,
    folder: "/data/tasks/b-1",
    account: { id: "blog-1" },
  });

  it.each([
    "blog.chaosyn.com",
    "www.blog.chaosyn.com/zh",
    "ftp://blog.chaosyn.com",
    "//blog.chaosyn.com",
    "https://",
    "https:///posts",
    "https:blog.chaosyn.com",
    "localhost:3000",
    "https://blog .chaosyn.com",
    "https://blog.chaosyn.com 博客",
  ])("%j 不是 http(s) 网址：直接失败，说清要以 https:// 开头", (site) => {
    expect(blogStepConfig(context(site))).toEqual({
      ok: false,
      outcome: { kind: "fail", error: FORMAT_ERROR },
    });
  });

  it.each([
    ["https://blog.chaosyn.com", "https://blog.chaosyn.com"],
    ["https://blog.chaosyn.com/", "https://blog.chaosyn.com"],
    ["  http://localhost:3000///  ", "http://localhost:3000"],
    ["HTTPS://Blog.Example.test", "HTTPS://Blog.Example.test"],
    ["https://example.test/blog", "https://example.test/blog"],
  ])("%j 是正常的网址：通过，去掉末尾的斜杠", (site, expected) => {
    const result = blogStepConfig(context(site));
    expect(result.ok && result.config.siteUrl).toBe(expected);
  });

  it("没配和配错是两回事：没配说「还没配」，配错说格式", () => {
    expect(blogStepConfig(context("   "))).toEqual({
      ok: false,
      outcome: { kind: "fail", error: "站点地址还没配" },
    });
  });

  it("三个步骤都在一开始就拦下，不碰仓库、不发请求", async () => {
    await withFixture(
      async (fixture) => {
        const net = stubs(200);
        expect(await archive(fixture, net)).toEqual({
          kind: "fail",
          error: FORMAT_ERROR,
        });
        expect(await gateBlogDraft(fixture.ctx)).toEqual({
          kind: "fail",
          error: FORMAT_ERROR,
        });
        expect(await publishBlogDraft(fixture.ctx)).toEqual({
          kind: "fail",
          error: FORMAT_ERROR,
        });
        expect(net.requests).toEqual([]);
        expect(fixture.gitCalls).toEqual([]);
        expect(fixture.pnpm.calls).toEqual([]);
      },
      { "site-url": "blog.chaosyn.com" },
    );
  });
});

describe("博客 archive 步骤：等不到上线时按最后一次的结果说原因", () => {
  it("请求一直抛错（连不上）：说出原因，带上站点", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(new Error("网络不通"));

      const outcome = await archive(fixture, net);

      expect(outcome).toEqual({
        kind: "fail",
        error: `连不上 ${SITE}：网络不通`,
      });
      // 照样等满 3 分钟：13 次请求、12 次等待
      expect(net.requests).toHaveLength(13);
      expect(net.sleeps).toHaveLength(12);
    });
  });

  it("Node 的 fetch 把真正的原因放在 cause 里：一并说出来", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(
        new TypeError("fetch failed", {
          cause: new Error("getaddrinfo ENOTFOUND blog.example.test"),
        }),
      );

      const outcome = await archive(fixture, net);

      expect(outcome).toEqual({
        kind: "fail",
        error: `连不上 ${SITE}：fetch failed（getaddrinfo ENOTFOUND blog.example.test）`,
      });
    });
  });

  it("单次请求超时：写成「10 秒内没有响应」，不是一句英文", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      );

      const outcome = await archive(fixture, net);

      expect(outcome).toEqual({
        kind: "fail",
        error: `连不上 ${SITE}：10 秒内没有响应`,
      });
    });
  });

  it("一直 404：还是原来的「还没上线」，让 agent 过一会儿再跑", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(404);

      const outcome = await archive(fixture, net);

      expect(outcome).toEqual({
        kind: "fail",
        error:
          "推送了，还没上线（Cloudflare 一般要几分钟）；过两三分钟再运行 leafpress work run b-1；超过半小时还不行，去 Cloudflare Pages 看部署记录",
      });
    });
  });

  it("一直是别的状态码：说出站点和状态码", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(503);

      const outcome = await archive(fixture, net);

      expect(outcome).toEqual({ kind: "fail", error: `${SITE} 返回 503` });
      expect(net.requests).toHaveLength(13);
    });
  });

  it.each([[403], [500], [410]])(
    "状态码 %i 也照实说，不当作「还没上线」",
    async (status) => {
      await withFixture(async (fixture) => {
        const outcome = await archive(fixture, stubs(status));

        expect(outcome).toEqual({
          kind: "fail",
          error: `${SITE} 返回 ${status}`,
        });
      });
    },
  );

  it("几种结果混着出现：说的是最后一次的结果", async () => {
    await withFixture(async (fixture) => {
      const notOnline = await archive(
        fixture,
        stubs(new Error("网络不通"), 500, 404),
      );
      expect(notOnline.kind === "fail" && notOnline.error).toContain(
        "还没上线",
      );
      expect(
        await archive(fixture, stubs(404, 404, new Error("网络不通"))),
      ).toEqual({ kind: "fail", error: `连不上 ${SITE}：网络不通` });
      expect(
        await archive(fixture, stubs(404, new Error("断了"), 502)),
      ).toEqual({ kind: "fail", error: `${SITE} 返回 502` });
    });
  });

  it("中途的抖动不影响结果：先连不上、再 5xx、最后 200，照样归档成功", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(new Error("网络不通"), 502, 200);

      const outcome = await archive(fixture, net);

      expect(outcome).toMatchObject({
        kind: "done",
        url: `${SITE}/posts/test-article/`,
      });
      expect(net.requests).toHaveLength(3);
    });
  });
});
