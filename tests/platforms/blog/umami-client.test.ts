import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUmamiClient,
  type UmamiClient,
  type UmamiClientOptions,
} from "../../../src/platforms/blog/umami/client.js";
import {
  UmamiAuthenticationError,
  UmamiRequestError,
  UmamiShareUrlError,
} from "../../../src/platforms/blog/umami/errors.js";
import { parseShareUrl } from "../../../src/platforms/blog/umami/share-url.js";
import { dayRangeInTimezone } from "../../../src/platforms/blog/umami/time.js";
import {
  API_BASE,
  FakeUmami,
  SHARE_ID,
  SHARE_URL,
  WEBSITE_ID,
  noSleep,
  type Traffic,
} from "./umami-fixtures.js";

afterEach(() => {
  vi.restoreAllMocks();
});

interface Harness {
  server: FakeUmami;
  client: UmamiClient;
  sleeps: number[];
}

function harness(
  traffic: Traffic = {},
  extra: Partial<UmamiClientOptions> = {},
): Harness {
  const server = new FakeUmami(traffic);
  const sleeps: number[] = [];
  const client = createUmamiClient({
    fetch: server.fetch,
    shareUrl: SHARE_URL,
    sleep: (ms) => {
      sleeps.push(ms);
      return noSleep();
    },
    ...extra,
  });
  return { server, client, sleeps };
}

/** 退避等待（0.5 秒起）；节流等待最多 200 毫秒，不算 */
function backoffs(sleeps: readonly number[]): number[] {
  return sleeps.filter((ms) => ms >= 500);
}

const OCT_8 = dayRangeInTimezone("2026-10-08");

describe("parseShareUrl", () => {
  it("拆出接口根地址和共享编号，查询串、锚点不影响", () => {
    expect(parseShareUrl(SHARE_URL)).toEqual({
      apiBase: API_BASE,
      shareId: SHARE_ID,
    });
    expect(
      parseShareUrl("https://cloud.umami.is/analytics/us/share/abc123#top"),
    ).toEqual({
      apiBase: "https://cloud.umami.is/analytics/us/api",
      shareId: "abc123",
    });
  });

  it("没有 analytics 前缀的自建 Umami；共享编号后面跟着网站名也认", () => {
    expect(parseShareUrl("https://umami.example.org/share/abc123")).toEqual({
      apiBase: "https://umami.example.org/api",
      shareId: "abc123",
    });
    expect(
      parseShareUrl("https://umami.example.org/share/abc123/my-site/"),
    ).toEqual({ apiBase: "https://umami.example.org/api", shareId: "abc123" });
  });

  it("格式不对返回 undefined", () => {
    for (const bad of [
      "",
      "不是网址",
      "http://umami.example.org/share/abc123",
      "https://umami.example.org/analytics/us/website/abc123",
      "https://umami.example.org/share/",
      "https://umami.example.org/share//x",
      "https://user:pass@umami.example.org/share/abc123",
      "https://umami.example.org/share/%E0%A4%A",
    ])
      expect(parseShareUrl(bad), bad).toBeUndefined();
  });
});

describe("dayRangeInTimezone", () => {
  it("上海：那天 0 点的毫秒，到次日 0 点减 1 毫秒", () => {
    expect(OCT_8.startAt).toBe(Date.UTC(2026, 9, 7, 16, 0, 0));
    expect(OCT_8.endAt).toBe(Date.UTC(2026, 9, 8, 16, 0, 0) - 1);
  });

  it("有夏令时的时区：切换那天只有 23 小时", () => {
    const range = dayRangeInTimezone("2026-03-08", "America/New_York");
    expect(range.startAt).toBe(Date.UTC(2026, 2, 8, 5, 0, 0));
    expect(range.endAt - range.startAt + 1).toBe(23 * 3_600_000);
  });

  it("日期写得不对时报错", () => {
    expect(() => dayRangeInTimezone("2026/10/08")).toThrow(UmamiRequestError);
  });
});

describe("createUmamiClient", () => {
  it("共享链接格式不对：直接报错", () => {
    expect(() =>
      createUmamiClient({ shareUrl: "https://umami.example.org/nothing" }),
    ).toThrow(UmamiShareUrlError);
    expect(() =>
      createUmamiClient({ shareUrl: "https://umami.example.org/nothing" }),
    ).toThrow("Umami 共享链接的格式不对");
  });

  it("取令牌：GET 共享接口，带 Accept 和共享上下文，不带令牌；取过就不再取", async () => {
    const { server, client } = harness();

    await client.auth();
    await client.auth();

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request?.url.href).toBe(`${API_BASE}/share/${SHARE_ID}`);
    expect(request?.headers).toEqual({
      accept: "application/json",
      "x-umami-share-context": "1",
    });
  });

  it("三个数据接口的路径、参数和请求头", async () => {
    const { server, client } = harness({ "2026-10-08": { "/a/": 3 } });

    await client.stats(OCT_8.startAt, OCT_8.endAt);
    await client.pageviews(OCT_8.startAt, OCT_8.endAt);
    await client.expandedPaths(OCT_8.startAt, OCT_8.endAt);

    const times = {
      startAt: String(OCT_8.startAt),
      endAt: String(OCT_8.endAt),
      timezone: "Asia/Shanghai",
    };
    const [stats] = server.of("stats");
    const [pageviews] = server.of("pageviews");
    const [expanded] = server.of("expanded");
    expect(stats?.url.pathname).toBe(
      `/analytics/us/api/websites/${WEBSITE_ID}/stats`,
    );
    expect(Object.fromEntries(stats?.url.searchParams ?? [])).toEqual({
      ...times,
      unit: "day",
    });
    expect(pageviews?.url.pathname).toBe(
      `/analytics/us/api/websites/${WEBSITE_ID}/pageviews`,
    );
    expect(Object.fromEntries(pageviews?.url.searchParams ?? [])).toEqual({
      ...times,
      unit: "day",
    });
    expect(expanded?.url.pathname).toBe(
      `/analytics/us/api/websites/${WEBSITE_ID}/metrics/expanded`,
    );
    expect(Object.fromEntries(expanded?.url.searchParams ?? [])).toEqual({
      ...times,
      type: "path",
      limit: "5000",
      offset: "0",
    });
    for (const request of [stats, pageviews, expanded]) {
      expect(request?.headers).toEqual({
        accept: "application/json",
        "x-umami-share-context": "1",
        "x-umami-share-token": server.currentToken,
      });
    }
  });

  it("数据接口的数：stats、pageviews（含 x 的两种写法）、expandedPaths 都读得对", async () => {
    const { server, client } = harness({
      "2026-10-07": { "/a/": 2, "/b/": { pageviews: 4, visitors: 1 } },
      "2026-10-08": { "/a/": 3 },
    });
    const range = {
      from: dayRangeInTimezone("2026-10-07").startAt,
      to: OCT_8.endAt,
    };

    expect(await client.stats(range.from, range.to)).toEqual({
      pageviews: 9,
      visitors: 6,
      visits: 9,
      bounces: 0,
      totaltime: 0,
    });
    expect(await client.pageviews(range.from, range.to)).toEqual([
      { day: "2026-10-07", pageviews: 6, sessions: 3 },
      { day: "2026-10-08", pageviews: 3, sessions: 3 },
    ]);
    expect(await client.expandedPaths(range.from, range.to)).toEqual([
      {
        name: "/a/",
        pageviews: 5,
        visitors: 5,
        visits: 5,
        bounces: 0,
        totaltime: 0,
      },
      {
        name: "/b/",
        pageviews: 4,
        visitors: 1,
        visits: 4,
        bounces: 0,
        totaltime: 0,
      },
    ]);

    // 老版本的 x 写法：2026-10-08 00:00:00；会话序列没给那天的数时是 null
    server.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({
            pageviews: [{ x: "2026-10-08 00:00:00", y: 7 }],
            sessions: [],
          })
        : undefined;
    expect(await client.pageviews(OCT_8.startAt, OCT_8.endAt)).toEqual([
      { day: "2026-10-08", pageviews: 7, sessions: null },
    ]);
  });

  it("日序列的会话数：和访问一起读出来；某天没有会话数时是 null；读不懂的会话行当没有，不让访问数据跟着失败", async () => {
    const { server, client } = harness({ "2026-10-08": { "/": 1 } });

    // 同一次返回里两条序列对得上号：访问看 pageviews，访客看 sessions
    server.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({
            pageviews: [
              { x: "2026-10-07T00:00:00Z", y: 6 },
              { x: "2026-10-08T00:00:00Z", y: 3 },
            ],
            sessions: [
              { x: "2026-10-07T00:00:00Z", y: 4 },
              { x: "2026-10-08T00:00:00Z", y: 2 },
            ],
          })
        : undefined;
    const range = {
      from: dayRangeInTimezone("2026-10-07").startAt,
      to: OCT_8.endAt,
    };
    expect(await client.pageviews(range.from, range.to)).toEqual([
      { day: "2026-10-07", pageviews: 6, sessions: 4 },
      { day: "2026-10-08", pageviews: 3, sessions: 2 },
    ]);

    // 返回体里没有 sessions：访问照读，会话全是 null
    server.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({ pageviews: [{ x: "2026-10-08T00:00:00Z", y: 5 }] })
        : undefined;
    expect(await client.pageviews(OCT_8.startAt, OCT_8.endAt)).toEqual([
      { day: "2026-10-08", pageviews: 5, sessions: null },
    ]);

    // 会话行读不懂：当没有，不报错
    server.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({
            pageviews: [{ x: "2026-10-08T00:00:00Z", y: 5 }],
            sessions: [{ x: "昨天", y: 1 }, { x: "2026-10-08T00:00:00Z" }],
          })
        : undefined;
    expect(await client.pageviews(OCT_8.startAt, OCT_8.endAt)).toEqual([
      { day: "2026-10-08", pageviews: 5, sessions: null },
    ]);
  });

  it("日序列一次最多 221 天，超过就分段，段与段首尾相接，结果合在一起", async () => {
    const { server, client } = harness({
      "2025-01-01": { "/": 1 },
      "2025-09-01": { "/": 2 },
      "2026-03-01": { "/": 3 },
    });
    const range = {
      from: dayRangeInTimezone("2025-01-01").startAt,
      to: dayRangeInTimezone("2026-03-01").endAt,
    };

    const series = await client.pageviews(range.from, range.to);

    expect(series).toEqual([
      { day: "2025-01-01", pageviews: 1, sessions: 1 },
      { day: "2025-09-01", pageviews: 2, sessions: 2 },
      { day: "2026-03-01", pageviews: 3, sessions: 3 },
    ]);
    const requests = server.of("pageviews");
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests[0]?.firstDay).toBe("2025-01-01");
    expect(requests[requests.length - 1]?.lastDay).toBe("2026-03-01");
    let covered = 0;
    requests.forEach((request, index) => {
      const startAt = Number(request.url.searchParams.get("startAt"));
      const endAt = Number(request.url.searchParams.get("endAt"));
      expect((endAt - startAt + 1) / 86_400_000).toBeLessThanOrEqual(221);
      covered += endAt - startAt + 1;
      const next = requests[index + 1];
      if (next)
        expect(Number(next.url.searchParams.get("startAt"))).toBe(endAt + 1);
    });
    expect(covered).toBe(range.to - range.from + 1);
  });

  it("时间范围不对：开始晚于结束，直接报错，不发请求", async () => {
    const { server, client } = harness();
    await expect(client.pageviews(OCT_8.endAt, OCT_8.startAt)).rejects.toThrow(
      "Umami 时间范围不对",
    );
    expect(server.requests).toEqual([]);
  });

  it("有读不懂的行（接口格式变了）：整次失败，不拿缺行的数", async () => {
    const { server, client } = harness();

    server.intercept = (request) =>
      request.kind === "expanded"
        ? Response.json([
            { name: "/a/", pageviews: 1, visitors: 1 },
            { name: "/b/", visitors: 1 },
          ])
        : undefined;
    await expect(
      client.expandedPaths(OCT_8.startAt, OCT_8.endAt),
    ).rejects.toThrow("Umami 返回的数据格式不对");

    server.intercept = (request) =>
      request.kind === "pageviews"
        ? Response.json({ pageviews: [{ x: "昨天", y: 3 }], sessions: [] })
        : undefined;
    await expect(client.pageviews(OCT_8.startAt, OCT_8.endAt)).rejects.toThrow(
      "Umami 返回的数据格式不对",
    );
  });
});

describe("expandedPaths 一次取够、分页时核对", () => {
  function manyPaths(count: number): Traffic {
    const day: Record<string, number> = {};
    for (let index = 0; index < count; index += 1) day[`/p/${index}/`] = 1;
    return { "2026-10-08": day };
  }

  it("返回的行数不到 limit：一次就取完，不再分页、不核对", async () => {
    const { server, client } = harness(manyPaths(120));

    const paths = await client.expandedPaths(OCT_8.startAt, OCT_8.endAt);

    expect(paths).toHaveLength(120);
    expect(server.of("expanded")).toHaveLength(1);
    expect(server.of("metrics")).toHaveLength(0);
  });

  it("行数等于 limit：继续分页，用普通路径列表核对名字，核对过就返回", async () => {
    const { server, client } = harness(manyPaths(5003));

    const paths = await client.expandedPaths(OCT_8.startAt, OCT_8.endAt);

    expect(new Set(paths.map((path) => path.name)).size).toBe(5003);
    expect(
      server
        .of("expanded")
        .map((request) => request.url.searchParams.get("offset")),
    ).toEqual(["0", "5000"]);
    const metrics = server.of("metrics");
    expect(
      metrics.map((request) => request.url.searchParams.get("offset")),
    ).toEqual(["0", "5000"]);
    expect(metrics[0]?.url.searchParams.get("type")).toBe("path");
    expect(
      Number(metrics[0]?.url.searchParams.get("limit")),
    ).toBeGreaterThanOrEqual(1000);
  });

  it("分页时重行漏行：整次重试一次，第二次对上就成功", async () => {
    const { server, client } = harness(manyPaths(5003));
    let tampered = false;
    server.intercept = (request) => {
      if (
        request.kind !== "expanded" ||
        request.url.searchParams.get("offset") !== "5000" ||
        tampered
      )
        return undefined;
      tampered = true;
      // 第二页把第一页的一行又给了一遍，还少了两行
      return Response.json([
        {
          name: "/p/0/",
          pageviews: 1,
          visitors: 1,
          visits: 1,
          bounces: 0,
          totaltime: 0,
        },
      ]);
    };

    const paths = await client.expandedPaths(OCT_8.startAt, OCT_8.endAt);

    expect(new Set(paths.map((path) => path.name)).size).toBe(5003);
    // 每一遍：两页 expanded + 两页 metrics；共两遍
    expect(server.of("expanded")).toHaveLength(4);
    expect(server.of("metrics")).toHaveLength(4);
  });

  it("重试之后仍然对不上：整次失败", async () => {
    const { server, client } = harness(manyPaths(5003));
    server.intercept = (request) =>
      request.kind === "expanded" &&
      request.url.searchParams.get("offset") === "5000"
        ? Response.json([
            {
              name: "/p/0/",
              pageviews: 1,
              visitors: 1,
              visits: 1,
              bounces: 0,
              totaltime: 0,
            },
          ])
        : undefined;

    await expect(
      client.expandedPaths(OCT_8.startAt, OCT_8.endAt),
    ).rejects.toThrow("Umami 分页路径不完整或有重复，重试后仍无法核对");
  });
});

describe("节流、超时和重试", () => {
  it("两次请求之间至少隔 200 毫秒", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { client, sleeps } = harness({});

    await client.stats(OCT_8.startAt, OCT_8.endAt);
    await client.stats(OCT_8.startAt, OCT_8.endAt);

    // 取令牌 + 两次 stats = 3 次请求，后两次各等 200 毫秒
    expect(sleeps).toEqual([200, 200]);
  });

  it("5xx：按 0.5、1 秒退避，第三次成功", async () => {
    const { server, client, sleeps } = harness({ "2026-10-08": { "/": 1 } });
    let failures = 2;
    server.intercept = (request) =>
      request.kind === "pageviews" && failures-- > 0
        ? new Response("boom", { status: 502 })
        : undefined;

    const series = await client.pageviews(OCT_8.startAt, OCT_8.endAt);

    expect(series).toEqual([{ day: "2026-10-08", pageviews: 1, sessions: 1 }]);
    expect(backoffs(sleeps)).toEqual([500, 1_000]);
    expect(server.of("pageviews")).toHaveLength(3);
  });

  it("5xx 一直不好：0.5、1、2 秒退避后放弃，错误里写状态码", async () => {
    const { server, client, sleeps } = harness();
    server.intercept = (request) =>
      request.kind === "stats"
        ? new Response("boom", { status: 503 })
        : undefined;

    await expect(client.stats(OCT_8.startAt, OCT_8.endAt)).rejects.toThrow(
      "Umami 服务暂时不可用（HTTP 503）",
    );

    expect(backoffs(sleeps)).toEqual([500, 1_000, 2_000]);
    expect(server.of("stats")).toHaveLength(4);
  });

  it("429：退避后重试；一直 429 报被限流", async () => {
    const { server, client, sleeps } = harness({ "2026-10-08": { "/": 1 } });
    let limited = 1;
    server.intercept = (request) =>
      request.kind === "pageviews" && limited-- > 0
        ? new Response("slow down", { status: 429 })
        : undefined;
    await client.pageviews(OCT_8.startAt, OCT_8.endAt);
    expect(backoffs(sleeps)).toEqual([500]);

    server.intercept = (request) =>
      request.kind === "stats" ? new Response("", { status: 429 }) : undefined;
    await expect(client.stats(OCT_8.startAt, OCT_8.endAt)).rejects.toThrow(
      "Umami 请求被限流（HTTP 429）",
    );
  });

  it("返回的不是 JSON：当作可重试，一直不对就报错", async () => {
    const { server, client } = harness();
    let broken = 1;
    server.intercept = (request) =>
      request.kind === "stats" && broken-- > 0
        ? new Response("<html>维护中</html>", { status: 200 })
        : undefined;
    await expect(
      client.stats(OCT_8.startAt, OCT_8.endAt),
    ).resolves.toBeDefined();
    expect(server.of("stats")).toHaveLength(2);

    server.intercept = (request) =>
      request.kind === "stats"
        ? new Response("<html>", { status: 200 })
        : undefined;
    await expect(client.stats(OCT_8.startAt, OCT_8.endAt)).rejects.toThrow(
      "Umami 返回的内容不是 JSON",
    );
  });

  it("网络错误：重试后报错，错误里没有地址", async () => {
    let calls = 0;
    const client = createUmamiClient({
      fetch: () => {
        calls += 1;
        return Promise.reject(new TypeError(`fetch failed: ${SHARE_URL}`));
      },
      shareUrl: SHARE_URL,
      sleep: noSleep,
    });

    const failure = await client.auth().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UmamiRequestError);
    expect((failure as Error).message).toBe("Umami 网络请求失败");
    expect(calls).toBe(4);
  });

  it("单次请求超时：当作可重试，不会一直等", async () => {
    const calls: number[] = [];
    const client = createUmamiClient({
      fetch: () => {
        calls.push(Date.now());
        return new Promise<Response>(() => undefined);
      },
      shareUrl: SHARE_URL,
      sleep: noSleep,
      requestTimeoutMs: 15,
    });

    await expect(client.auth()).rejects.toThrow("Umami 请求超时");

    expect(calls).toHaveLength(4);
  });
});

describe("令牌", () => {
  it("数据接口 401：先重新取令牌，再试同一个请求", async () => {
    const { server, client } = harness({ "2026-10-08": { "/": 2 } });
    await client.auth();
    server.rotateToken();

    const series = await client.pageviews(OCT_8.startAt, OCT_8.endAt);

    expect(series).toEqual([{ day: "2026-10-08", pageviews: 2, sessions: 2 }]);
    expect(server.of("share")).toHaveLength(2);
    const attempts = server.of("pageviews");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.url.search).toBe(attempts[0]?.url.search);
    expect(attempts[0]?.headers["x-umami-share-token"]).not.toBe(
      server.currentToken,
    );
    expect(attempts[1]?.headers["x-umami-share-token"]).toBe(
      server.currentToken,
    );
  });

  it("重取令牌后还是 401、403：报被拒绝，不算共享链接失效，也不再重取", async () => {
    for (const status of [401, 403]) {
      const { server, client } = harness();
      server.intercept = (request) =>
        request.kind === "stats" ? new Response("no", { status }) : undefined;

      const failure = await client
        .stats(OCT_8.startAt, OCT_8.endAt)
        .catch((error: unknown) => error);

      expect(failure).not.toBeInstanceOf(UmamiAuthenticationError);
      expect((failure as Error).message).toBe(
        `Umami 数据请求被拒绝（HTTP ${status}）`,
      );
      expect(server.of("share")).toHaveLength(2);
      expect(server.of("stats")).toHaveLength(2);
    }
  });

  it("取令牌这一步被拒（401、403、404）才算共享链接失效", async () => {
    for (const status of [401, 403, 404]) {
      const { server, client } = harness();
      server.shareStatus = status;

      const failure = await client.auth().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(UmamiAuthenticationError);
      expect((failure as Error).message).toBe(
        "Umami 共享链接打不开了（可能被关掉或换了）",
      );
      expect(server.of("share")).toHaveLength(1);
    }
  });

  it("令牌作废后重取时共享链接已经关了：算共享链接失效", async () => {
    const { server, client } = harness();
    await client.auth();
    server.rotateToken();
    server.shareStatus = 404;

    await expect(
      client.stats(OCT_8.startAt, OCT_8.endAt),
    ).rejects.toBeInstanceOf(UmamiAuthenticationError);
  });

  it("数据接口返回 404 或 400：照实报错，不算共享链接失效", async () => {
    for (const status of [400, 404]) {
      const { server, client } = harness();
      server.intercept = (request) =>
        request.kind === "stats" ? new Response("", { status }) : undefined;

      const failure = await client
        .stats(OCT_8.startAt, OCT_8.endAt)
        .catch((error: unknown) => error);

      expect(failure).not.toBeInstanceOf(UmamiAuthenticationError);
      expect((failure as Error).message).toBe(
        `Umami 请求失败（HTTP ${status}）`,
      );
      expect(server.of("stats")).toHaveLength(1);
    }
  });
});

describe("错误文字里没有共享编号、令牌、网站编号和地址", () => {
  it("各种失败的错误文字都干净", async () => {
    const failures: { name: string; run: () => Promise<unknown> }[] = [];
    const add = (
      name: string,
      configure: (server: FakeUmami) => void,
      call: (client: UmamiClient) => Promise<unknown>,
      extra: Partial<UmamiClientOptions> = {},
    ): void => {
      failures.push({
        name,
        run: () => {
          const { server, client } = harness(
            { "2026-10-08": { "/": 1 } },
            extra,
          );
          configure(server);
          return call(client);
        },
      });
    };
    const stats = (client: UmamiClient) =>
      client.stats(OCT_8.startAt, OCT_8.endAt);
    add("取令牌被拒", (server) => (server.shareStatus = 404), stats);
    add(
      "5xx",
      (server) => {
        server.intercept = (request) =>
          request.kind === "stats"
            ? new Response("", { status: 500 })
            : undefined;
      },
      stats,
    );
    add(
      "400",
      (server) => {
        server.intercept = (request) =>
          request.kind === "stats"
            ? new Response("", { status: 400 })
            : undefined;
      },
      stats,
    );
    add(
      "数据被拒",
      (server) => {
        server.intercept = (request) =>
          request.kind === "stats"
            ? new Response("", { status: 401 })
            : undefined;
      },
      stats,
    );
    add(
      "授权响应格式不对",
      (server) => {
        server.intercept = (request) =>
          request.kind === "share"
            ? Response.json({ nothing: true })
            : undefined;
      },
      stats,
    );
    add(
      "数据格式不对",
      (server) => {
        server.intercept = (request) =>
          request.kind === "expanded"
            ? Response.json({ unexpected: 1 })
            : undefined;
      },
      (client) => client.expandedPaths(OCT_8.startAt, OCT_8.endAt),
    );

    for (const failure of failures) {
      const error = await failure.run().catch((caught: unknown) => caught);
      expect(error, failure.name).toBeInstanceOf(Error);
      const text = `${(error as Error).name} ${(error as Error).message}`;
      for (const forbidden of [
        SHARE_ID,
        WEBSITE_ID,
        "fake-token",
        "umami.example.test",
        "https://",
        "/api/",
      ])
        expect(text, `${failure.name}：${forbidden}`).not.toContain(forbidden);
    }
  });
});
