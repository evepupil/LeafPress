import { describe, expect, it } from "vitest";

import { createZhihuClient } from "../../../src/platforms/zhihu/api/client.js";
import {
  ZhihuApiError,
  ZhihuAuthenticationError,
} from "../../../src/platforms/zhihu/api/errors.js";
import {
  ACCESS_SECRET,
  API_BASE,
  failed,
  FakeFetch,
  noSleep,
  ok,
} from "./api-fixtures.js";

/** 假时钟：时间只随 sleep 前进（不真等），等过多少记下来供断言 */
class FakeClock {
  private current = new Date("2026-10-02T00:00:00Z").getTime();
  readonly sleeps: number[] = [];
  readonly now = (): Date => new Date(this.current);
  readonly sleep = (milliseconds: number): Promise<void> => {
    this.sleeps.push(milliseconds);
    this.current += milliseconds;
    return Promise.resolve();
  };
}

/** 建一个用假 fetch、假时钟的客户端，等待都记下来但不真等 */
function client(
  responses: Response[],
  extra: { requestTimeoutMs?: number; hangs?: boolean } = {},
) {
  const fake = new FakeFetch();
  for (const response of responses) fake.always(response);
  const clock = new FakeClock();
  const tool = createZhihuClient({
    secret: ACCESS_SECRET,
    fetch: fake.fetch,
    sleep: clock.sleep,
    now: clock.now,
    ...(extra.requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs: extra.requestTimeoutMs }),
  });
  return { tool, sleeps: clock.sleeps, fake };
}

/** 挂住不放的 fetch（测超时） */
class HangingFetch {
  readonly calls: number[] = [];
  readonly fetch: typeof fetch = async () => {
    this.calls.push(this.calls.length + 1);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return ok({});
  };
}

/** 把客户端的错误接住转成普通值，方便断言 */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("认证头和请求", () => {
  it("带 Authorization、秒级 X-Request-Timestamp，查询参数原样拼上", async () => {
    const fake = new FakeFetch();
    fake.always(ok({ hello: "zhihu" }));
    const sleeps: number[] = [];

    await createZhihuClient({
      secret: ACCESS_SECRET,
      fetch: fake.fetch,
      sleep: (ms) => {
        sleeps.push(ms);
        return noSleep();
      },
      now: () => new Date("2026-10-02T00:00:00Z"),
    }).get("/user/creator_account_stats", {
      ContentType: "all",
      StartDate: "2026-10-01",
      EndDate: "2026-10-01",
    });

    // FakeFetch 不记头，另用带断言的假 fetch 验一次
    const seen: { url: URL; headers: Record<string, string> }[] = [];
    const fetchWithHeaders: typeof fetch = (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      ))
        headers[key] = value;
      seen.push({ url, headers });
      return Promise.resolve(ok({}));
    };
    await createZhihuClient({
      secret: ACCESS_SECRET,
      fetch: fetchWithHeaders,
      sleep: noSleep,
      now: () => new Date("2026-10-02T00:00:00Z"),
    }).get("/user/creator_account_stats", {
      ContentType: "all",
      StartDate: "2026-10-01",
      EndDate: "2026-10-01",
    });

    expect(seen).toHaveLength(1);
    const call = seen[0];
    expect(call?.url.toString()).toBe(
      `${API_BASE}/user/creator_account_stats` +
        "?ContentType=all&StartDate=2026-10-01&EndDate=2026-10-01",
    );
    expect(call?.headers["Authorization"]).toBe(`Bearer ${ACCESS_SECRET}`);
    // 秒级，不是毫秒：2026-10-02T00:00:00Z = 1790899200
    expect(call?.headers["X-Request-Timestamp"]).toBe("1790899200");
    expect(call?.headers["Content-Type"]).toBe("application/json");
  });

  it("成功：返回外层 Data 里的内容", async () => {
    const { tool } = client([ok({ hello: "zhihu" })]);
    await expect(tool.get("/user/contents")).resolves.toEqual({
      hello: "zhihu",
    });
  });

  it("限流间隔：相邻两次请求至少等 1100 毫秒，第一次不等", async () => {
    const { tool, sleeps } = client([ok({}), ok({})]);

    await tool.get("/user/contents");
    await tool.get("/user/contents");

    // 第一次请求不等待；第二次之前等到间隔满 1.1 秒
    expect(sleeps).toEqual([1_100]);
  });
});

describe("超时和重试", () => {
  it("超时：按 1 秒、3 秒退避重试两次，三次都超时才失败", async () => {
    const hanging = new HangingFetch();
    const clock = new FakeClock();

    const error = await caught(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: hanging.fetch,
        sleep: clock.sleep,
        now: clock.now,
        requestTimeoutMs: 20,
      }).get("/user/contents"),
    );

    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message: "知乎开放平台请求超时",
    });
    expect(hanging.calls).toHaveLength(3);
    // 退避 1 秒后补齐限流间隔再发第二次；退避 3 秒已够间隔，直接发第三次
    expect(clock.sleeps).toEqual([1_000, 100, 3_000]);
  });

  it("5xx：重试两次，第三次成功就不报错", async () => {
    const fake = new FakeFetch();
    fake.always(new Response("bad", { status: 502 }));
    fake.always(new Response("bad", { status: 503 }));
    fake.always(ok({ fine: 1 }));
    const clock = new FakeClock();

    await expect(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: fake.fetch,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    ).resolves.toEqual({ fine: 1 });
    expect(clock.sleeps).toEqual([1_000, 100, 3_000]);
  });

  it("网络错误：重试两次仍失败，写清原因", async () => {
    const clock = new FakeClock();
    const broken: typeof fetch = () =>
      Promise.reject(new TypeError("fetch failed"));

    const error = await caught(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: broken,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    );

    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message: "知乎开放平台网络请求失败",
    });
    expect(clock.sleeps).toEqual([1_000, 100, 3_000]);
  });

  it("4xx 不重试：直接失败", async () => {
    const fake = new FakeFetch();
    fake.always(new Response("no", { status: 404 }));
    const clock = new FakeClock();

    const error = await caught(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: fake.fetch,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    );

    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message: "知乎开放平台请求失败（HTTP 404）",
    });
    expect(fake.requests).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });
});

describe("业务错误码", () => {
  async function errorOf(responses: Response[]): Promise<unknown> {
    const { tool } = client(responses);
    return caught(tool.get("/user/creator_account_stats"));
  }

  it("每秒超限一次：等 2 秒重试同一请求就成功，限流间隔也照补", async () => {
    const fake = new FakeFetch();
    fake.always(failed(30001, "second limit exceeded"));
    fake.always(ok({ fine: 1 }));
    const clock = new FakeClock();

    await expect(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: fake.fetch,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    ).resolves.toEqual({ fine: 1 });

    // 业务重试等 2 秒（已经够限流间隔，不再补）
    expect(fake.requests).toHaveLength(2);
    expect(clock.sleeps).toEqual([2_000]);
  });

  it("偶发失败（90001）一次：等 2 秒重试就成功", async () => {
    const fake = new FakeFetch();
    fake.always(failed(90001, "request failed"));
    fake.always(ok({ fine: 2 }));
    const clock = new FakeClock();

    await expect(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: fake.fetch,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    ).resolves.toEqual({ fine: 2 });

    expect(fake.requests).toHaveLength(2);
    expect(clock.sleeps).toEqual([2_000]);
  });

  it("每秒超限连续 4 次：重试 3 次仍不行，报错带上接口的 Message", async () => {
    // Response 的 body 只能读一次，四次得是四个独立响应
    const error = await errorOf([
      failed(30001, "second limit exceeded"),
      failed(30001, "second limit exceeded"),
      failed(30001, "second limit exceeded"),
      failed(30001, "second limit exceeded"),
    ]);

    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message:
        "知乎开放平台限流（每秒调用次数超了），重试 3 次仍不行：second limit exceeded",
    });
  });

  it("90001 重试 3 次仍不行：报错带上接口的 Message", async () => {
    const error = await errorOf([
      failed(90001, "request failed"),
      failed(90001, "request failed"),
      failed(90001, "request failed"),
      failed(90001, "request failed"),
    ]);

    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message: "知乎开放平台请求失败（90001），重试 3 次仍不行：request failed",
    });
  });

  it("其余的 30001：不重试，整次失败并说清是当天额度用完", async () => {
    const { tool, fake, sleeps } = client([failed(30001, "quota exceeded")]);
    const error = await caught(tool.get("/user/creator_account_stats"));

    expect(error).toBeInstanceOf(ZhihuApiError);
    expect(error).toHaveProperty("code", 30001);
    expect(error).toHaveProperty(
      "message",
      "知乎开放平台今天的额度用完了（30001）：quota exceeded",
    );
    expect(fake.requests).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("30002：不重试，说清是额外成功次数额度用完", async () => {
    const error = await errorOf([failed(30002, "extra quota exhausted")]);
    expect(error).toHaveProperty("code", 30002);
    expect(error).toHaveProperty(
      "message",
      "知乎开放平台的额外成功次数额度用完了（30002），今天不用再拉",
    );
  });

  it("30003：不重试，说清是被风控拦下", async () => {
    const error = await errorOf([failed(30003, "risk control")]);
    expect(error).toHaveProperty("code", 30003);
    expect(error).toHaveProperty(
      "message",
      "知乎开放平台把这次请求当成风控拦下了（30003），过一阵再拉",
    );
  });

  it("额度错误码只发一次请求", async () => {
    const fake = new FakeFetch();
    fake.always(failed(30001));
    const clock = new FakeClock();
    await caught(
      createZhihuClient({
        secret: ACCESS_SECRET,
        fetch: fake.fetch,
        sleep: clock.sleep,
        now: clock.now,
      }).get("/user/contents"),
    );
    expect(fake.requests).toHaveLength(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("20001：密钥不对 → ZhihuAuthenticationError", async () => {
    expect(await errorOf([failed(20001, "bad access secret")])).toBeInstanceOf(
      ZhihuAuthenticationError,
    );
  });

  it("其余错误码：原样带上 Code", async () => {
    const error = await errorOf([failed(99007, "internal")]);
    expect(error).toHaveProperty("code", 99007);
    expect(error).toHaveProperty(
      "message",
      "知乎开放平台返回错误（99007：internal）",
    );
  });

  it("外层不是 { Code, Message, Data }：报格式不对", async () => {
    const error = await errorOf([Response.json("not an envelope")]);
    expect(error).toMatchObject({
      name: "ZhihuApiError",
      message: "知乎开放平台返回的格式不对",
    });
  });
});

describe("错误文字抹掉密钥", () => {
  it("接口回的 Message 里带密钥时，错误文字里没有它", async () => {
    const error = await caught(
      client([
        Response.json({
          Code: 40005,
          Message: `invalid token ${ACCESS_SECRET}`,
          Data: null,
        }),
      ]).tool.get("/user/contents"),
    );

    expect(error).toHaveProperty("name", "ZhihuApiError");
    const message = error instanceof Error ? error.message : String(error);
    expect(message).not.toContain(ACCESS_SECRET);
    expect(message).toContain("<redacted>");
  });
});
