import { describe, expect, it } from "vitest";

import type { UmamiExpandedPath } from "../../../src/platforms/blog/umami/client.js";
import {
  articlePathOfUrl,
  countByArticlePath,
  isArticlePath,
  normalizePath,
  parseSiteRule,
  siteTotalPageviews,
  worksByArticlePath,
} from "../../../src/platforms/blog/umami/paths.js";
import { makeWork } from "./umami-fixtures.js";

function row(
  name: string,
  pageviews: number,
  visitors = pageviews,
): UmamiExpandedPath {
  return {
    name,
    pageviews,
    visitors,
    visits: pageviews,
    bounces: 0,
    totaltime: 0,
  };
}

const SITE = { host: "blog.example.test", prefix: "/" };

describe("normalizePath", () => {
  it("去掉查询串和锚点，统一以 / 结尾", () => {
    expect(normalizePath("/posts/a")).toBe("/posts/a/");
    expect(normalizePath("/posts/a/")).toBe("/posts/a/");
    expect(normalizePath("/posts/a#intro")).toBe("/posts/a/");
    expect(normalizePath("/posts/a/?utm_source=x&y=1")).toBe("/posts/a/");
    expect(normalizePath("/posts/a?x=1#top")).toBe("/posts/a/");
  });

  it("URL 解码：编码和解码两种写法归到同一个", () => {
    expect(normalizePath("/posts/%E4%B8%AD%E6%96%87/")).toBe("/posts/中文/");
    expect(normalizePath("/posts/中文")).toBe("/posts/中文/");
  });

  it("先去查询串再解码：被编码的问号是文章名的一部分", () => {
    expect(normalizePath("/posts/a%3Fb/")).toBe("/posts/a?b/");
  });

  it("解码不了就按原样比", () => {
    expect(normalizePath("/posts/100%/")).toBe("/posts/100%/");
  });
});

describe("parseSiteRule", () => {
  it("没配站点地址：不限主机，站点在域名根上", () => {
    expect(parseSiteRule(undefined)).toEqual({ prefix: "/" });
    expect(parseSiteRule("  ")).toEqual({ prefix: "/" });
  });

  it("配了：记主机名（小写）和路径前缀", () => {
    expect(parseSiteRule("https://Blog.Example.test/")).toEqual(SITE);
    expect(parseSiteRule("https://example.test:8080/blog")).toEqual({
      host: "example.test:8080",
      prefix: "/blog/",
    });
  });

  it("不是网址返回 undefined", () => {
    expect(parseSiteRule("blog.example.test")).toBeUndefined();
    expect(parseSiteRule("ftp://example.test")).toBeUndefined();
  });
});

describe("只认本站中文文章地址", () => {
  it("中文文章路径认，英文和别的页面不认", () => {
    expect(isArticlePath("/posts/a/", SITE)).toBe(true);
    expect(isArticlePath("/en/posts/a/", SITE)).toBe(false);
    expect(isArticlePath("/posts/", SITE)).toBe(false);
    expect(isArticlePath("/posts/a/b/", SITE)).toBe(false);
    expect(isArticlePath("/archives/", SITE)).toBe(false);
    expect(isArticlePath("/", SITE)).toBe(false);
  });

  it("站点放在子路径下时，前缀也要对上", () => {
    const site = { host: "example.test", prefix: "/blog/" };
    expect(isArticlePath("/blog/posts/a/", site)).toBe(true);
    expect(isArticlePath("/posts/a/", site)).toBe(false);
  });

  it("作品链接换成文章路径：编码写法、查询串、不带结尾斜杠都认", () => {
    expect(articlePathOfUrl("https://blog.example.test/posts/a/", SITE)).toBe(
      "/posts/a/",
    );
    expect(articlePathOfUrl("https://blog.example.test/posts/a", SITE)).toBe(
      "/posts/a/",
    );
    expect(
      articlePathOfUrl("https://BLOG.example.test/posts/a/?x=1#top", SITE),
    ).toBe("/posts/a/");
    expect(
      articlePathOfUrl(
        "https://blog.example.test/posts/%E4%B8%AD%E6%96%87/",
        SITE,
      ),
    ).toBe("/posts/中文/");
    expect(
      articlePathOfUrl("https://blog.example.test/posts/中文/", SITE),
    ).toBe("/posts/中文/");
  });

  it("不是本站、不是中文文章、没有链接的都不认", () => {
    expect(articlePathOfUrl("https://other.example.test/posts/a/", SITE)).toBe(
      undefined,
    );
    expect(
      articlePathOfUrl("https://blog.example.test/en/posts/a/", SITE),
    ).toBe(undefined);
    expect(articlePathOfUrl("https://blog.example.test/", SITE)).toBe(
      undefined,
    );
    expect(articlePathOfUrl("不是网址", SITE)).toBe(undefined);
    expect(articlePathOfUrl(undefined, SITE)).toBe(undefined);
  });

  it("没配站点地址时不比主机", () => {
    expect(
      articlePathOfUrl("https://other.example.test/posts/a/", { prefix: "/" }),
    ).toBe("/posts/a/");
  });
});

describe("worksByArticlePath", () => {
  it("按文章路径分组；只要这个账号的、链接对得上的作品", () => {
    const groups = worksByArticlePath(
      [
        makeWork("b-1", "a"),
        makeWork("b-2", "a"),
        makeWork("b-3", "b"),
        makeWork("b-4", "c", { accountId: "blog-2" }),
        makeWork("b-5", "d", { url: "https://other.example.test/posts/d/" }),
        makeWork("b-6", "e", { url: "https://blog.example.test/en/posts/e/" }),
        { ...makeWork("b-7", "f"), url: undefined },
      ],
      "blog-1",
      SITE,
    );

    expect(
      [...groups].map(([path, works]) => [path, works.map((w) => w.id)]),
    ).toEqual([
      ["/posts/a/", ["b-1", "b-2"]],
      ["/posts/b/", ["b-3"]],
    ]);
  });
});

describe("countByArticlePath", () => {
  it("原始行先按路径名去重，再按规范化后的路径合并求和；英文和别的页面不计", () => {
    const counts = countByArticlePath(
      [
        row("/posts/a/", 10, 6),
        row("/posts/a/", 10, 6),
        row("/posts/a", 3, 2),
        row("/posts/a/#intro", 1, 1),
        row("/posts/a/?utm_source=x", 2, 2),
        row("/posts/%E4%B8%AD%E6%96%87/", 4, 3),
        row("/posts/中文/", 1, 1),
        row("/en/posts/a/", 50),
        row("/posts/", 20),
        row("/", 99),
      ],
      SITE,
    );

    expect([...counts]).toEqual([
      ["/posts/a/", { pageviews: 16, visitors: 11 }],
      ["/posts/中文/", { pageviews: 5, visitors: 4 }],
    ]);
  });
});

describe("siteTotalPageviews", () => {
  it("全站访问合计：重复的原始行只算一次，英文和别的页面也算", () => {
    expect(
      siteTotalPageviews([
        row("/posts/a/", 10),
        row("/posts/a/", 10),
        row("/en/posts/a/", 5),
        row("/", 7),
      ]),
    ).toBe(22);
  });
});
