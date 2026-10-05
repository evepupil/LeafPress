/**
 * 博客原稿列、读的测试：全部在临时目录里造数据。
 *
 * 覆盖规格「验证方式」第 3、5 条：
 * zh/ 和 en/ 各几篇，覆盖 .md 和 .mdx、Notion 来源、加引号和不加引号的日期、
 * 缺 title、日期写错、同名 .md/.mdx 重复；以及各种不合法 ref。
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  listBlogSources,
  readBlogSource,
} from "../../../src/platforms/blog/source-provider.js";
import type { LeafPressError } from "../../../src/shared/errors.js";

let baseDir: string;
let repoPath: string;
let outsideDir: string;
let symlinkCreated = false;
let symlinkError: unknown;
const contentDir = "posts";

/** 原稿的 frontmatter + 正文模板：值序列化成合法 YAML */
function post(meta: Record<string, unknown>, body: string): string {
  const lines = Object.entries(meta).map(([key, value]) => {
    if (typeof value === "string") return `${key}: "${value}"`;
    // 数组用 JSON 序列化，正好是合法的 YAML 流式写法
    return `${key}: ${JSON.stringify(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

/** 日期故意不加引号的写法：JSON_SCHEMA 下保持字符串，验证解析链 */
function postUnquotedDate(meta: Record<string, unknown>, body: string): string {
  const lines = Object.entries(meta).map(([key, value]) => {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${key}: ${value}`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

beforeAll(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "leafpress-blog-"));
  repoPath = join(baseDir, "blog-repo");
  const zh = join(repoPath, contentDir, "zh");
  const en = join(repoPath, contentDir, "en");
  await mkdir(zh, { recursive: true });
  await mkdir(en, { recursive: true });

  // zh：两篇正常的 + 一篇缺 title + 一篇日期写错 + 一对同名重复
  await writeFile(
    join(zh, "claude-code-rules.md"),
    post(
      {
        title: "Claude Code 使用守则",
        description: "怎么把 Claude Code 用顺手",
        published: "2026-03-04",
        updated: "2026-04-01",
        locale: "zh-CN",
        tags: ["ai", "工具"],
        draft: false,
        translationKey: "claude-code-rules",
        source: "notion",
      },
      "正文一 ![配图](/images/rules.png)\n\n[站内](/docs/other)\n",
    ),
    "utf8",
  );
  await writeFile(
    join(zh, "mermaid-guide.mdx"),
    postUnquotedDate(
      {
        title: "流程图入门",
        published: "2026-03-04",
        locale: "zh-CN",
        draft: true,
        tags: ["diagram"],
      },
      "import { Callout } from 'nextra/components'\n\n```mermaid\ngraph TD; A-->B;\n```\n",
    ),
    "utf8",
  );
  await writeFile(
    join(zh, "older.md"),
    post(
      { title: "更早的一篇", published: "2025-12-31", locale: "zh-CN" },
      "正文。",
    ),
    "utf8",
  );
  await writeFile(
    join(zh, "no-title.md"),
    post({ published: "2026-01-01", locale: "zh-CN" }, "缺标题。"),
    "utf8",
  );
  await writeFile(
    join(zh, "bad-date.md"),
    post(
      { title: "日期错了", published: "今年春天", locale: "zh-CN" },
      "正文。",
    ),
    "utf8",
  );
  // 日历上不存在的日期：加引号和不加引号都要拒绝
  await writeFile(
    join(zh, "bad-calendar.md"),
    post(
      { title: "日历错误", published: "2026-02-31", locale: "zh-CN" },
      "正文。",
    ),
    "utf8",
  );
  await writeFile(
    join(zh, "bad-calendar-unquoted.md"),
    "---\ntitle: 日历错误不加引号\npublished: 2026-02-31\nlocale: zh-CN\n---\n\n正文。",
    "utf8",
  );
  await writeFile(
    join(zh, "dup.md"),
    post(
      { title: "重复 md", published: "2026-02-02", locale: "zh-CN" },
      "md 版",
    ),
    "utf8",
  );
  await writeFile(
    join(zh, "dup.mdx"),
    post(
      { title: "重复 mdx", published: "2026-02-02", locale: "zh-CN" },
      "mdx 版",
    ),
    "utf8",
  );
  // 更深的目录不算原稿
  await mkdir(join(zh, "nested"), { recursive: true });
  await writeFile(
    join(zh, "nested", "deep.md"),
    post({ title: "太深", published: "2026-05-05", locale: "zh-CN" }, "深处"),
    "utf8",
  );

  // en：一篇英文，日期写成加引号的带时间字符串（验证取前 10 位）、非 notion 来源
  await writeFile(
    join(en, "claude-code-rules.mdx"),
    post(
      {
        title: "Claude Code Rules",
        published: "2026-03-04T08:00:00+08:00",
        locale: "en",
        translationKey: "claude-code-rules",
        source: "repo",
      },
      "English body.\n",
    ),
    "utf8",
  );

  // 符号链接：指向原稿目录外的文件。Windows 无特权时 symlink 会报 EPERM，
  // 这时记下标记，后面的符号链接测试用例自行跳过
  outsideDir = join(baseDir, "outside");
  await mkdir(outsideDir, { recursive: true });
  await writeFile(
    join(outsideDir, "evil.md"),
    post({ title: "目录外", published: "2026-07-07", locale: "zh-CN" }, "外头"),
    "utf8",
  );
  try {
    await symlink(
      join(outsideDir, "evil.md"),
      join(zh, "evil-link.md"),
      "file",
    );
    symlinkCreated = true;
  } catch (error) {
    // Windows 上建不了符号链接（EPERM/ENOTSUP）：测试用例里跳过，不让测试失败
    symlinkCreated = false;
    symlinkError = error;
  }
});

afterAll(async () => {
  await rm(baseDir, { recursive: true, force: true });
});

const options = () => ({ repoPath, contentDir });

describe("listBlogSources：列表与问题", () => {
  it("收齐所有语言目录里合法的原稿，深层目录和重复文件不算", async () => {
    const { sources } = await listBlogSources(options());
    expect(sources.map((s) => s.ref).sort()).toEqual([
      "en/claude-code-rules",
      "zh/claude-code-rules",
      "zh/mermaid-guide",
      "zh/older",
    ]);
  });

  it("按 publishedAt 倒序、同日按 ref 升序", async () => {
    const { sources } = await listBlogSources(options());
    expect(sources.map((s) => s.ref)).toEqual([
      // 同一天 2026-03-04：en 在前（e < z）
      "en/claude-code-rules",
      "zh/claude-code-rules",
      "zh/mermaid-guide",
      "zh/older",
    ]);
  });

  it("摘要字段：Notion 来源、翻译键、内容哈希、绝对路径", async () => {
    const { sources } = await listBlogSources(options());
    const zhPost = sources.find((s) => s.ref === "zh/claude-code-rules");
    expect(zhPost).toBeDefined();
    expect(zhPost?.title).toBe("Claude Code 使用守则");
    expect(zhPost?.locale).toBe("zh-CN");
    expect(zhPost?.publishedAt).toBe("2026-03-04");
    expect(zhPost?.updatedAt).toBe("2026-04-01");
    expect(zhPost?.tags).toEqual(["ai", "工具"]);
    expect(zhPost?.draft).toBe(false);
    expect(zhPost?.translationKey).toBe("claude-code-rules");
    expect(zhPost?.origin).toBe("notion");
    expect(zhPost?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(zhPost?.path).toBe(
      join(repoPath, contentDir, "zh", "claude-code-rules.md"),
    );
  });

  it("draft 与缺省 tags、来源 repo", async () => {
    const { sources } = await listBlogSources(options());
    const guide = sources.find((s) => s.ref === "zh/mermaid-guide");
    expect(guide?.draft).toBe(true);
    expect(guide?.tags).toEqual(["diagram"]);
    const enPost = sources.find((s) => s.ref === "en/claude-code-rules");
    expect(enPost?.origin).toBe("repo");
    expect(enPost?.locale).toBe("en");
  });

  it("缺 title、日期写错、日历错误、同名重复都记进问题列表，文件本身不进列表", async () => {
    const { sources, issues } = await listBlogSources(options());
    const refs = sources.map((s) => s.ref);
    expect(refs).not.toContain("zh/no-title");
    expect(refs).not.toContain("zh/bad-date");
    expect(refs).not.toContain("zh/bad-calendar");
    expect(refs).not.toContain("zh/bad-calendar-unquoted");
    expect(refs).not.toContain("zh/dup");
    if (symlinkCreated) {
      expect(refs).not.toContain("zh/evil-link");
    }

    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        join(repoPath, contentDir, "zh", "no-title.md"),
        join(repoPath, contentDir, "zh", "bad-date.md"),
        join(repoPath, contentDir, "zh", "bad-calendar.md"),
        join(repoPath, contentDir, "zh", "bad-calendar-unquoted.md"),
        join(repoPath, contentDir, "zh", "dup"),
      ]),
    );
    const badDate = issues.find((i) => i.path.endsWith("bad-date.md"));
    expect(badDate?.message).toContain("published");
    // 加引号和不加引号的 2026-02-31 都拒绝（默认引擎会把它悄悄进位成 3 月，JSON_SCHEMA 不会）
    for (const name of ["bad-calendar.md", "bad-calendar-unquoted.md"]) {
      const badCalendar = issues.find((i) => i.path.endsWith(name));
      expect(badCalendar?.message).toContain("published");
    }
    const dup = issues.find((i) => i.path.endsWith("dup"));
    expect(dup?.message).toContain("同名文件重复");
    const noTitle = issues.find((i) => i.path.endsWith("no-title.md"));
    expect(noTitle?.message).toContain("title");
  });

  it("语言目录读不了（悬空的目录链接）：记一条问题，其余语言目录照常", async () => {
    // 悬空目录链接：dirent 不是文件也不是目录，readDirEntries 报 ENOENT
    const target = join(baseDir, "vanished");
    await mkdir(target, { recursive: true });
    const dangling = join(repoPath, contentDir, "it");
    try {
      await symlink(target, dangling, "junction");
    } catch {
      // Windows 无特权时 junction 一般也能建；真建不了就跳过本用例
      console.log("跳过语言目录读取失败测试：无法创建目录链接");
      return;
    }
    await rm(target, { recursive: true, force: true });

    const { sources, issues } = await listBlogSources(options());
    // 其余语言目录照常
    expect(sources.map((s) => s.ref)).toContain("zh/claude-code-rules");
    expect(sources.map((s) => s.ref)).toContain("en/claude-code-rules");
    // 读不了的语言目录记一条问题
    const brokenIssue = issues.find((i) => i.path === dangling);
    expect(brokenIssue?.message).toContain("语言目录读不了");

    // 清理
    await rm(dangling, { force: true });
  });

  it("指向目录外的符号链接：list 跳过并记问题，read 抛 SOURCE_NOT_FOUND", async () => {
    if (!symlinkCreated) {
      // Windows 无特权建不了符号链接（EPERM/ENOTSUP）：跳过，不让测试失败
      console.log(
        `跳过符号链接测试：无法创建符号链接（${symlinkError instanceof Error ? symlinkError.message : String(symlinkError)}）`,
      );
      return;
    }
    const { sources, issues } = await listBlogSources(options());
    expect(sources.map((s) => s.ref)).not.toContain("zh/evil-link");
    const evilIssue = issues.find((i) => i.path.endsWith("evil-link.md"));
    expect(evilIssue).toBeDefined();
    expect(evilIssue?.message).toContain("原稿目录");

    const promise = readBlogSource(options(), "zh/evil-link");
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "SOURCE_NOT_FOUND",
    });
  });

  it("指向目录内的符号链接文件：list 照常收录，read 能读到", async () => {
    if (!symlinkCreated) {
      console.log("跳过目录内符号链接测试：无法创建符号链接");
      return;
    }
    // 在 zh/ 里建一个指向同目录真实文件的链接
    const zhDir = join(repoPath, contentDir, "zh");
    const target = join(zhDir, "older.md");
    let created = true;
    try {
      await symlink(target, join(zhDir, "older-link.md"), "file");
    } catch {
      created = false;
    }
    if (!created) {
      console.log("跳过目录内符号链接测试：无法创建符号链接");
      return;
    }
    const { sources, issues } = await listBlogSources(options());
    expect(sources.map((s) => s.ref)).toContain("zh/older-link");
    expect(
      issues.find((i) => i.path.endsWith("older-link.md")),
    ).toBeUndefined();
    const parsed = await readBlogSource(options(), "zh/older-link");
    expect(parsed.title).toBe("更早的一篇");
  });
});

describe("readBlogSource：读单篇", () => {
  it("各字段齐全：摘要 + description + body + 图片/流程图/站内链接 + 原始元数据", async () => {
    const parsed = await readBlogSource(options(), "zh/claude-code-rules");
    expect(parsed.ref).toBe("zh/claude-code-rules");
    expect(parsed.title).toBe("Claude Code 使用守则");
    expect(parsed.description).toBe("怎么把 Claude Code 用顺手");
    expect(parsed.body).toBe(
      "\n正文一 ![配图](/images/rules.png)\n\n[站内](/docs/other)\n",
    );
    expect(parsed.images).toEqual(["/images/rules.png"]);
    expect(parsed.internalLinks).toEqual(["/docs/other"]);
    expect(parsed.mermaidBlockCount).toBe(0);
    expect(parsed.frontmatter).toMatchObject({
      title: "Claude Code 使用守则",
      source: "notion",
    });
    expect(parsed.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("mermaid 计数：mdx 正文里的流程图", async () => {
    const parsed = await readBlogSource(options(), "zh/mermaid-guide");
    expect(parsed.mermaidBlockCount).toBe(1);
    // mdx 的 import 不影响正文解析
    expect(parsed.body).toContain("import { Callout }");
  });

  it("同名时先找 .mdx 再找 .md", async () => {
    // 造一个既在 .mdx 又在 .md 的合法同名对（read 不做同名检查，按 .mdx 优先）
    const dir = join(repoPath, contentDir, "fr");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "both.md"),
      post(
        { title: "md 版本", published: "2026-06-01", locale: "fr" },
        "md 正文",
      ),
      "utf8",
    );
    await writeFile(
      join(dir, "both.mdx"),
      post(
        { title: "mdx 版本", published: "2026-06-01", locale: "fr" },
        "mdx 正文",
      ),
      "utf8",
    );
    const parsed = await readBlogSource(options(), "fr/both");
    expect(parsed.path.endsWith(".mdx")).toBe(true);
    expect(parsed.title).toBe("mdx 版本");
    // 只有一个扩展名时也能读
    const mdOnly = await readBlogSource(options(), "zh/claude-code-rules");
    expect(mdOnly.path.endsWith(".md")).toBe(true);
  });

  it("大小写不同的同名对（guide.md 与 GUIDE.mdx）：按同名重复处理，两个都不收、不能读", async () => {
    const dir = join(repoPath, contentDir, "cs");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "guide.md"),
      post(
        { title: "小写版", published: "2026-06-02", locale: "cs" },
        "小写正文",
      ),
      "utf8",
    );
    await writeFile(
      join(dir, "GUIDE.mdx"),
      post(
        { title: "大写版", published: "2026-06-02", locale: "cs" },
        "大写正文",
      ),
      "utf8",
    );
    const { sources, issues } = await listBlogSources(options());
    expect(sources.map((s) => s.ref)).not.toContain("cs/guide");
    expect(sources.map((s) => s.ref)).not.toContain("cs/GUIDE");
    const dup = issues.find(
      (i) => i.path.endsWith("guide") || i.path.endsWith("GUIDE"),
    );
    expect(dup?.message).toContain("同名文件重复");
    // read 按区分大小写匹配实际文件：两个 ref 各自读到对应的那个文件
    const lower = await readBlogSource(options(), "cs/guide");
    expect(lower.title).toBe("小写版");
    const upper = await readBlogSource(options(), "cs/GUIDE");
    expect(upper.title).toBe("大写版");
  });

  it("大写扩展名（cs/CAPS.MDX）：list 收录、read 用扫描到的实际文件能读到", async () => {
    const dir = join(repoPath, contentDir, "cs");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "CAPS.MDX"),
      post(
        { title: "大写扩展名", published: "2026-06-03", locale: "cs" },
        "大写扩展名正文",
      ),
      "utf8",
    );
    const { sources } = await listBlogSources(options());
    expect(sources.map((s) => s.ref)).toContain("cs/CAPS");
    const parsed = await readBlogSource(options(), "cs/CAPS");
    expect(parsed.title).toBe("大写扩展名");
    expect(parsed.path.toLowerCase().endsWith(".mdx")).toBe(true);
  });

  it("不合法 ref：../x、zh/../../x、zh\\x、缺语言目录、点段、文件不存在，都抛 SOURCE_NOT_FOUND", async () => {
    const badRefs = [
      "../x",
      "zh/../../x",
      "zh\\x",
      "onlyslug",
      "zh/does-not-exist",
      "zh/",
      "/plain",
      "zh/a/b",
      "./README",
      "../outside",
      "zh/..",
    ];
    for (const ref of badRefs) {
      const promise = readBlogSource(options(), ref);
      await expect(promise).rejects.toMatchObject({
        name: "LeafPressError",
        code: "SOURCE_NOT_FOUND",
      });
    }
  });

  it("元数据校验不过的文件读单篇抛 SOURCE_INVALID", async () => {
    const promise = readBlogSource(options(), "zh/no-title");
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "SOURCE_INVALID",
    });
    const error: LeafPressError = await promise.then(
      () => {
        throw new Error("应该抛错但没有抛");
      },
      (e: LeafPressError) => e,
    );
    expect(error.message).toContain("title");
  });
});

describe("原稿目录不存在", () => {
  it("抛 BLOG_REPO_INVALID，hint 指向配置", async () => {
    const promise = listBlogSources({
      repoPath: join(baseDir, "no-such-repo"),
      contentDir,
    });
    await expect(promise).rejects.toMatchObject({
      name: "LeafPressError",
      code: "BLOG_REPO_INVALID",
    });
    const error: LeafPressError = await promise.then(
      () => {
        throw new Error("应该抛错但没有抛");
      },
      (e: LeafPressError) => e,
    );
    expect(error.hint).toContain("blog.repoPath");
    expect(error.hint).toContain("blog.contentDir");
  });
});
