import { describe, expect, it } from "vitest";

import yaml from "js-yaml";

import { parseFrontmatter } from "../../../src/platforms/blog/frontmatter.js";

/**
 * 模拟 source-provider 的解析链：YAML 用 js-yaml 的 JSON_SCHEMA 解析。
 * 这里用它验证「不加引号的日期保持字符串」确实成立，再喂给 parseFrontmatter。
 */
function parseWithJsonSchema(yamlText: string): unknown {
  return yaml.load(yamlText, { schema: yaml.JSON_SCHEMA });
}

/** 结果是不是「published 不是日期」的失败形态 */
function badPublishedShape(
  result: ReturnType<typeof parseFrontmatter>,
): boolean {
  return !result.ok && result.message === "published：不是 YYYY-MM-DD 日期";
}

describe("parseFrontmatter", () => {
  it("完整合法的元数据：全部字段按规整后返回", () => {
    const result = parseFrontmatter({
      title: "一篇原稿",
      description: "简介",
      published: "2026-03-04",
      updated: "2026-04-05",
      locale: "zh-CN",
      tags: ["a", "b"],
      draft: true,
      translationKey: "post-1",
      source: "notion",
    });
    expect(result).toEqual({
      ok: true,
      meta: {
        title: "一篇原稿",
        description: "简介",
        publishedAt: "2026-03-04",
        updatedAt: "2026-04-05",
        locale: "zh-CN",
        tags: ["a", "b"],
        draft: true,
        translationKey: "post-1",
        origin: "notion",
      },
    });
  });

  it("可选字段缺省：tags 为空数组、draft 为 false、origin 为 repo", () => {
    const result = parseFrontmatter({
      title: "只有必填",
      published: "2026-01-02",
      locale: "en",
    });
    expect(result).toEqual({
      ok: true,
      meta: {
        title: "只有必填",
        publishedAt: "2026-01-02",
        locale: "en",
        tags: [],
        draft: false,
        origin: "repo",
      },
    });
  });

  it("带时间的 ISO 日期（2026-09-30T08:00:00Z）取日期部分", () => {
    const result = parseFrontmatter({
      title: "t",
      published: "2026-09-30T08:00:00Z",
      locale: "zh-CN",
    });
    expect(result.ok && result.meta.publishedAt).toBe("2026-09-30");
  });

  it("日期后缀垃圾、时分秒越界都拒绝", () => {
    for (const bad of [
      "2026-03-04oops", // 纯日期后面带垃圾
      "2026-03-04T99:99:99Z", // 时分秒越界
      "2026-03-04T25:00:00Z", // 时越界
      "2026-03-04T10:61:00Z", // 分越界
      "2026-03-04T10:00:61Z", // 秒越界
      "2026-03-04T10:00", // 不完整的 ISO 时间
      "2026-03-04T10:00:00+24:00", // 时区时越界
      "2026-03-04 10:00:00", // 空格分隔不是 ISO
    ]) {
      const result = parseFrontmatter({
        title: "t",
        published: bad,
        locale: "zh-CN",
      });
      expect(result).toEqual({
        ok: false,
        message: "published：不是 YYYY-MM-DD 日期",
      });
    }
    // 带时区的合法 ISO 时间仍接受，取日期部分
    const zoned = parseFrontmatter({
      title: "t",
      published: "2026-09-30T08:00:00+08:00",
      locale: "zh-CN",
    });
    expect(zoned.ok && zoned.meta.publishedAt).toBe("2026-09-30");
  });

  it("日历上不存在的日期拒绝：2026-02-31、2026-13-01", () => {
    for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10"]) {
      const result = parseFrontmatter({
        title: "t",
        published: bad,
        locale: "zh-CN",
      });
      expect(result).toEqual({
        ok: false,
        message: "published：不是 YYYY-MM-DD 日期",
      });
    }
    // updated 同样严格
    const badUpdated = parseFrontmatter({
      title: "t",
      published: "2026-03-04",
      updated: "2026-04-31",
      locale: "zh-CN",
    });
    expect(badUpdated).toEqual({
      ok: false,
      message: "updated：不是 YYYY-MM-DD 日期",
    });
  });

  it("低年份（0000～0099）日历校验正确：闰年手算，不经 Date（Date.UTC 会映射到 1900 年代）", () => {
    // 0029 不是闰年（29 % 4 = 1，且 Date.UTC(29,...) 会变成 1929），0029-02-29 必须拒
    const badLeap = parseFrontmatter({
      title: "t",
      published: "0029-02-29",
      locale: "zh-CN",
    });
    expect(badPublishedShape(badLeap)).toBe(true);
    // 0024 是闰年（24 % 4 = 0，非百年），0024-02-29 合法
    const leap = parseFrontmatter({
      title: "t",
      published: "0024-02-29",
      locale: "zh-CN",
    });
    expect(leap.ok && leap.meta.publishedAt).toBe("0024-02-29");
    // 0000 按规则是闰年（% 400 = 0）：0000-02-29 合法（Date.UTC 会错算成 2000 年，恰好也是闰年；
    // 但 0050-02-29 在 Date 下会变 1950 平年错进位到 3 月，手算才能正确拒绝）
    const century = parseFrontmatter({
      title: "t",
      published: "0050-02-29",
      locale: "zh-CN",
    });
    expect(badPublishedShape(century)).toBe(true);
    // 1900 不是闰年（% 100 = 0 且 % 400 ≠ 0）
    const bad1900 = parseFrontmatter({
      title: "t",
      published: "1900-02-29",
      locale: "zh-CN",
    });
    expect(badPublishedShape(bad1900)).toBe(true);
    // 2000 是闰年（% 400 = 0）
    const ok2000 = parseFrontmatter({
      title: "t",
      published: "2000-02-29",
      locale: "zh-CN",
    });
    expect(ok2000.ok && ok2000.meta.publishedAt).toBe("2000-02-29");
  });

  it("日期对象（日期被解析成 Date）不再是合法输入", () => {
    const result = parseFrontmatter({
      title: "t",
      published: new Date("2026-03-04T00:00:00.000Z"),
      locale: "zh-CN",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("published");
  });

  it("缺 title 记一条问题，message 里有字段名", () => {
    const result = parseFrontmatter({
      published: "2026-03-04",
      locale: "zh-CN",
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("title");
  });

  it("类型错误：locale 是数字、tags 不是数组都记问题", () => {
    const badLocale = parseFrontmatter({
      title: "t",
      published: "2026-03-04",
      locale: 42,
    });
    expect(badLocale.ok).toBe(false);
    expect(badLocale.ok ? "" : badLocale.message).toContain("locale");

    const badTags = parseFrontmatter({
      title: "t",
      published: "2026-03-04",
      locale: "zh-CN",
      tags: "a,b",
    });
    expect(badTags.ok).toBe(false);
    expect(badTags.ok ? "" : badTags.message).toContain("tags");
  });

  it("未列出的字段原样放行，不影响校验", () => {
    const result = parseFrontmatter({
      title: "t",
      published: "2026-03-04",
      locale: "zh-CN",
      custom: { nested: [1, 2] },
    });
    expect(result.ok).toBe(true);
  });
});

describe("JSON_SCHEMA 解链（与 source-provider 的引擎一致）", () => {
  it("不加引号的日期保持字符串，走同一条校验链", () => {
    const data = parseWithJsonSchema(
      "published: 2026-03-04\nlocale: zh-CN",
    ) as {
      published: unknown;
    };
    expect(typeof data.published).toBe("string");
    const result = parseFrontmatter({ title: "t", ...data });
    expect(result.ok && result.meta.publishedAt).toBe("2026-03-04");
  });

  it("不加引号的日历错误日期不会被悄悄进位，直接拒绝", () => {
    // gray-matter 默认引擎会把 2026-02-31 转成 2026-03-03 的日期对象；JSON_SCHEMA 保持字符串
    const data = parseWithJsonSchema("published: 2026-02-31") as {
      published: unknown;
    };
    expect(data.published).toBe("2026-02-31");
    const result = parseFrontmatter({
      title: "t",
      locale: "zh-CN",
      ...data,
    });
    expect(result).toEqual({
      ok: false,
      message: "published：不是 YYYY-MM-DD 日期",
    });
  });
});
