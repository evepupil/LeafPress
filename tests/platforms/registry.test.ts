/**
 * 平台登记表与默认登记表的测试。
 *
 * 覆盖规格「验证方式」第 2 条：重复登记报错、未知平台、不支持的形态、
 * 发布目标的展开顺序和排除；以及知乎、博客两个接入的能力声明。
 */
import { describe, expect, it } from "vitest";

import type { PlatformAdapter } from "../../src/platforms/types.js";
import {
  createDefaultRegistry,
  PlatformRegistry,
} from "../../src/platforms/registry.js";
import { createBlogAdapter } from "../../src/platforms/blog/index.js";
import {
  createZhihuAdapter,
  ZHIHU_PLATFORM_ID,
} from "../../src/platforms/zhihu/index.js";
import { LeafPressError } from "../../src/shared/errors.js";

/** 一个只有长文能力的假平台 */
function fakeAdapter(
  id: string,
  formats: string[] = ["article"],
): PlatformAdapter {
  return {
    id,
    name: `平台${id}`,
    capabilities: formats.map((format) => ({
      // 测试用假形态编号，绕开 FormatId 联合类型
      format: format as never,
      constraints: {},
      publishModes: ["manual" as const],
    })),
  };
}

describe("PlatformRegistry", () => {
  it("重复登记同一个编号抛 INTERNAL", () => {
    const registry = new PlatformRegistry();
    registry.register(fakeAdapter("x"));
    expect(() => registry.register(fakeAdapter("x"))).toThrowError(
      expect.objectContaining({ code: "INTERNAL" }) as LeafPressError,
    );
  });

  it("get 未知平台抛 PLATFORM_UNKNOWN，message 列出已登记的平台", () => {
    const registry = new PlatformRegistry();
    registry.register(fakeAdapter("alpha"));
    registry.register(fakeAdapter("beta"));
    const error = (() => {
      try {
        registry.get("gamma");
        return undefined;
      } catch (e) {
        return e as LeafPressError;
      }
    })();
    expect(error?.code).toBe("PLATFORM_UNKNOWN");
    expect(error?.message).toContain("gamma");
    expect(error?.message).toContain("alpha");
    expect(error?.message).toContain("beta");
  });

  it("has、list：list 按登记顺序", () => {
    const registry = new PlatformRegistry();
    registry.register(fakeAdapter("second"));
    registry.register(fakeAdapter("first"));
    expect(registry.has("second")).toBe(true);
    expect(registry.has("nope")).toBe(false);
    expect(registry.list().map((a) => a.id)).toEqual(["second", "first"]);
  });

  it("capability：支持的形态返回能力，不支持的抛 FORMAT_UNSUPPORTED", () => {
    const registry = new PlatformRegistry();
    registry.register(fakeAdapter("multi", ["article", "answer"]));
    const cap = registry.capability("multi", "answer");
    expect(cap.format).toBe("answer");

    expect(() => registry.capability("multi", "carousel")).toThrowError(
      expect.objectContaining({ code: "FORMAT_UNSUPPORTED" }) as LeafPressError,
    );
    // 平台不存在先报 PLATFORM_UNKNOWN
    expect(() => registry.capability("nope", "article")).toThrowError(
      expect.objectContaining({ code: "PLATFORM_UNKNOWN" }) as LeafPressError,
    );
  });

  it("publishTargets：按登记顺序 → 能力声明顺序展开；excludePlatforms 排除指定平台", () => {
    const registry = new PlatformRegistry();
    registry.register(fakeAdapter("p1", ["article", "carousel"]));
    registry.register(fakeAdapter("p2", ["answer"]));

    const all = registry.publishTargets();
    expect(all.map((t) => `${t.platform}/${t.format as string}`)).toEqual([
      "p1/article",
      "p1/carousel",
      "p2/answer",
    ]);
    expect(all[0]?.platformName).toBe("平台p1");
    expect(all[0]?.capability.publishModes).toEqual(["manual"]);

    const excluded = registry.publishTargets({ excludePlatforms: ["p1"] });
    expect(excluded.map((t) => t.platform)).toEqual(["p2"]);
  });
});

describe("createZhihuAdapter：知乎能力声明", () => {
  const adapter = createZhihuAdapter();

  it("编号 zhihu、名字知乎、没有原稿来源", () => {
    expect(adapter.id).toBe(ZHIHU_PLATFORM_ID);
    expect(adapter.id).toBe("zhihu");
    expect(adapter.name).toBe("知乎");
    expect(adapter.sources).toBeUndefined();
  });

  it("长文：titleRequired、支持代码块和数学、不支持 mermaid、外链可以，发布方式 skill-handoff", () => {
    const article = adapter.capabilities.find((c) => c.format === "article");
    expect(article?.constraints).toMatchObject({
      titleRequired: true,
      supportsCodeBlocks: true,
      supportsMath: true,
      supportsMermaid: false,
      supportsExternalLinks: true,
    });
    expect(article?.publishModes).toEqual(["skill-handoff"]);
  });

  it("回答：requiresQuestion，发布方式 manual", () => {
    const answer = adapter.capabilities.find((c) => c.format === "answer");
    expect(answer?.constraints).toMatchObject({
      requiresQuestion: true,
      supportsCodeBlocks: true,
      supportsMath: true,
      supportsMermaid: false,
      supportsExternalLinks: true,
    });
    expect(answer?.publishModes).toEqual(["manual"]);
  });
});

describe("createBlogAdapter：博客能力声明", () => {
  it("编号 blog、名字博客、能力只有长文、带原稿来源", () => {
    const adapter = createBlogAdapter({
      repoPath: "C:/nowhere",
      contentDir: "posts",
      remote: "origin",
      branch: "main",
    });
    expect(adapter.id).toBe("blog");
    expect(adapter.name).toBe("博客");
    expect(adapter.capabilities.map((c) => c.format)).toEqual(["article"]);
    expect(adapter.capabilities[0]?.constraints).toMatchObject({
      titleRequired: true,
      supportsCodeBlocks: true,
      supportsMath: true,
      supportsMermaid: true,
      supportsExternalLinks: true,
    });
    expect(adapter.capabilities[0]?.publishModes).toEqual(["git"]);
    expect(adapter.sources).toBeDefined();
    expect(typeof adapter.sources?.list).toBe("function");
    expect(typeof adapter.sources?.read).toBe("function");
    expect(typeof adapter.sources?.sync).toBe("function");
  });

  it("remote 填网址（https:// 或 git@host:path）时抛 CONFIG_INVALID，且不回显原值", () => {
    for (const bad of [
      "https://user:secret@github.com/yeton/yeton-blog.git",
      "http://example.com/repo.git",
      "git@github.com:yeton/yeton-blog.git",
      "ssh://git@host/path",
    ]) {
      const capture = (): LeafPressError => {
        try {
          createBlogAdapter({
            repoPath: "C:/nowhere",
            contentDir: "posts",
            remote: bad,
            branch: "main",
          });
          throw new Error("应该抛错但没有抛");
        } catch (e) {
          return e as LeafPressError;
        }
      };
      const error = capture();
      expect(error).toBeInstanceOf(LeafPressError);
      expect(error.code).toBe("CONFIG_INVALID");
      expect(error.message).toContain("blog.remote");
      expect(error.message).toContain("不是网址");
    }
    // 带口令的网址：message 和 hint 都不能把口令打出来
    const secret = "https://user:pass-word-123@github.com/x/y.git";
    let leaked: LeafPressError | undefined;
    try {
      createBlogAdapter({
        repoPath: "C:/nowhere",
        contentDir: "posts",
        remote: secret,
        branch: "main",
      });
    } catch (e) {
      leaked = e as LeafPressError;
    }
    expect(leaked?.code).toBe("CONFIG_INVALID");
    expect(`${leaked?.message} ${leaked?.hint ?? ""}`).not.toContain(
      "pass-word-123",
    );
    expect(`${leaked?.message} ${leaked?.hint ?? ""}`).not.toContain(
      "github.com",
    );
    // 合法的远程名照常创建
    expect(() =>
      createBlogAdapter({
        repoPath: "C:/nowhere",
        contentDir: "posts",
        remote: "origin",
        branch: "main",
      }),
    ).not.toThrow();
  });
});

describe("createDefaultRegistry", () => {
  it("依次登记博客、知乎；publishTargets 展开顺序正确，可排除博客", () => {
    const registry = createDefaultRegistry({
      blog: {
        repoPath: "C:/nowhere",
        contentDir: "posts",
        remote: "origin",
        branch: "main",
      },
    });
    expect(registry.list().map((a) => a.id)).toEqual(["blog", "zhihu"]);

    const targets = registry.publishTargets();
    expect(targets.map((t) => `${t.platform}/${t.format as string}`)).toEqual([
      "blog/article",
      "zhihu/article",
      "zhihu/answer",
    ]);

    // 发布状态总览要排除博客自己
    const withoutBlog = registry.publishTargets({ excludePlatforms: ["blog"] });
    expect(withoutBlog.map((t) => t.platform)).toEqual(["zhihu", "zhihu"]);
    expect(withoutBlog.map((t) => t.format)).toEqual(["article", "answer"]);
  });
});
