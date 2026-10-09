import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createBlogArchiveHandler } from "../../../src/platforms/blog/steps/archive.js";
import { createPlatformRuntime } from "../../../src/platforms/registry.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";
import {
  type BlogFixture,
  draftText,
  makeBlogFixture,
} from "./steps-fixtures.js";

type Reply = number | "network-error";

interface Stubs {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  requests: { url: string; method: string | undefined; hasSignal: boolean }[];
  sleeps: number[];
}

/** 假的网络请求和等待：按给定顺序回应，用完后一直回最后一个；等待只记数，不真等 */
function stubs(replies: Reply[]): Stubs {
  const result: Stubs = {
    requests: [],
    sleeps: [],
    fetch: (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      result.requests.push({
        url,
        method: init?.method,
        hasSignal: init?.signal !== undefined && init.signal !== null,
      });
      const reply =
        replies[Math.min(result.requests.length - 1, replies.length - 1)];
      if (reply === undefined || reply === "network-error")
        return Promise.reject(new Error("网络不通"));
      return Promise.resolve(new Response("正文", { status: reply }));
    },
    sleep: (ms) => {
      result.sleeps.push(ms);
      return Promise.resolve();
    },
  };
  return result;
}

async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
  options: Parameters<typeof makeBlogFixture>[0] = {},
): Promise<void> {
  const fixture = await makeBlogFixture({ withRepo: false, ...options });
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

const URL_OF_POST = "https://blog.example.test/posts/test-article/";

describe("博客 archive 步骤：等上线并归档链接", () => {
  it("先 404 两次再 200：归档中文地址、发布日期（取稿子 frontmatter）、原稿位置和编号", async () => {
    await withFixture(async (fixture) => {
      const net = stubs([404, 404, 200]);
      const handler = createBlogArchiveHandler({
        fetch: net.fetch,
        sleep: net.sleep,
      });

      const outcome = await handler(fixture.ctx);

      expect(outcome).toEqual({
        kind: "done",
        url: URL_OF_POST,
        // ctx.today 是 2026-10-09，发布日期必须取稿子里写的 2026-10-08
        publishedAt: "2026-10-08",
        localPath: join(
          fixture.repo,
          "content",
          "posts",
          "zh",
          "test-article.mdx",
        ),
        sourceRef: "zh/test-article",
        note: "已上线",
      });
      expect(net.requests).toHaveLength(3);
      for (const request of net.requests) {
        expect(request.url).toBe(URL_OF_POST);
        expect(request.method).toBe("GET");
        expect(request.hasSignal).toBe(true);
      }
      expect(net.sleeps).toEqual([15_000, 15_000]);
      expect(fixture.heartbeats).toBe(3);
    });
  });

  it("一开始就 200：不等待", async () => {
    await withFixture(async (fixture) => {
      const net = stubs([200]);

      const outcome = await createBlogArchiveHandler({
        fetch: net.fetch,
        sleep: net.sleep,
      })(fixture.ctx);

      expect(outcome.kind).toBe("done");
      expect(net.sleeps).toEqual([]);
    });
  });

  it("一直 404：每 15 秒看一次，最多等 3 分钟（共 13 次请求、12 次等待），然后失败", async () => {
    await withFixture(async (fixture) => {
      const net = stubs([404]);

      const outcome = await createBlogArchiveHandler({
        fetch: net.fetch,
        sleep: net.sleep,
      })(fixture.ctx);

      expect(outcome).toEqual({
        kind: "fail",
        error:
          "推送了，还没上线（Cloudflare 一般要几分钟）；过两三分钟再运行 leafpress work run b-1；超过半小时还不行，去 Cloudflare Pages 看部署记录",
      });
      expect(net.requests).toHaveLength(13);
      expect(net.sleeps).toHaveLength(12);
      expect(net.sleeps.every((ms) => ms === 15_000)).toBe(true);
      expect(net.sleeps.reduce((sum, ms) => sum + ms, 0)).toBe(180_000);
      expect(fixture.heartbeats).toBe(13);
    });
  });

  it("网络错误、5xx、404 都算还没上线，继续等", async () => {
    await withFixture(async (fixture) => {
      const net = stubs(["network-error", 500, 503, 404, 200]);

      const outcome = await createBlogArchiveHandler({
        fetch: net.fetch,
        sleep: net.sleep,
      })(fixture.ctx);

      expect(outcome.kind).toBe("done");
      expect(net.requests).toHaveLength(5);
      expect(net.sleeps).toHaveLength(4);
    });
  });

  it("没传依赖时用步骤上下文里的 fetch 和 sleep；传了依赖就用依赖的", async () => {
    await withFixture(async (fixture) => {
      const fromContext = stubs([404, 200]);
      const ctx: CodeStepContext = {
        ...fixture.ctx,
        fetch: fromContext.fetch,
        sleep: fromContext.sleep,
      };
      expect((await createBlogArchiveHandler()(ctx)).kind).toBe("done");
      expect(fromContext.requests).toHaveLength(2);
      expect(fromContext.sleeps).toEqual([15_000]);

      const injected = stubs([200]);
      const fresh = stubs([404]);
      const overridden = await createBlogArchiveHandler({
        fetch: injected.fetch,
        sleep: injected.sleep,
      })({ ...ctx, fetch: fresh.fetch, sleep: fresh.sleep });
      expect(overridden.kind).toBe("done");
      expect(injected.requests).toHaveLength(1);
      expect(fresh.requests).toHaveLength(0);
    });
  });

  it("登记表的 createPlatformRuntime 把 fetch 和 sleep 传给博客的归档步骤", async () => {
    await withFixture(async (fixture) => {
      const net = stubs([404, 200]);
      const handler = createPlatformRuntime({
        fetch: net.fetch,
        sleep: net.sleep,
      }).codeStep("blog-write", "archive");

      const outcome = await handler?.(fixture.ctx);

      expect(outcome?.kind).toBe("done");
      expect(net.requests).toHaveLength(2);
      expect(net.sleeps).toEqual([15_000]);
    });
  });

  it("站点地址末尾的斜杠不会拼出双斜杠", async () => {
    await withFixture(
      async (fixture) => {
        const net = stubs([200]);
        await createBlogArchiveHandler({ fetch: net.fetch, sleep: net.sleep })(
          fixture.ctx,
        );
        expect(net.requests[0]?.url).toBe(
          "https://blog.example.test/posts/test-article/",
        );
      },
      { settings: { "site-url": "https://blog.example.test///" } },
    );
  });

  it("仓库位置或站点地址没配：直接失败，不发请求", async () => {
    const net = stubs([200]);
    await withFixture(
      async (fixture) => {
        expect(
          await createBlogArchiveHandler({
            fetch: net.fetch,
            sleep: net.sleep,
          })(fixture.ctx),
        ).toEqual({ kind: "fail", error: "博客仓库位置还没配" });
      },
      { settings: { "repo-path": undefined } },
    );
    await withFixture(
      async (fixture) => {
        expect(
          await createBlogArchiveHandler({
            fetch: net.fetch,
            sleep: net.sleep,
          })(fixture.ctx),
        ).toEqual({ kind: "fail", error: "站点地址还没配" });
      },
      { settings: { "site-url": undefined } },
    );
    expect(net.requests).toHaveLength(0);
  });

  it("slug.txt 或中文稿的发布日期有问题：失败并说明，不发请求", async () => {
    await withFixture(async (fixture) => {
      const net = stubs([200]);
      const handler = createBlogArchiveHandler({
        fetch: net.fetch,
        sleep: net.sleep,
      });

      await writeFile(join(fixture.folder, "slug.txt"), "Bad Slug\n", "utf8");
      const badSlug = await handler(fixture.ctx);
      expect(badSlug.kind).toBe("fail");
      if (badSlug.kind === "fail")
        expect(badSlug.error).toMatch(/^slug\.txt 里的 slug 格式不对/);

      await writeFile(join(fixture.folder, "slug.txt"), "test-article\n");
      await writeFile(
        join(fixture.folder, "中文稿.mdx"),
        draftText({
          title: "t",
          locale: "zh-CN",
          published: "2026-10-08",
        }),
        "utf8",
      );
      const badDay = await handler(fixture.ctx);
      expect(badDay.kind).toBe("fail");
      if (badDay.kind === "fail")
        expect(badDay.error).toContain("published 没加引号");

      expect(net.requests).toHaveLength(0);
    });
  });
});
