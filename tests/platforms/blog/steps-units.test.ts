import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  formatReport,
  lastLines,
} from "../../../src/platforms/blog/steps/checks.js";
import {
  blogStepConfig,
  dataHome,
  redactBlogText,
  stepFailure,
} from "../../../src/platforms/blog/steps/config.js";
import {
  clearGateOutputs,
  clearPublishRecord,
  readGateRecord,
  writeCheckReport,
  writeGateRecord,
  writePublishRecord,
} from "../../../src/platforms/blog/steps/records.js";
import type { CodeStepContext } from "../../../src/platforms/types.js";
import { exists, ok } from "./steps-fixtures.js";

let folder = "";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "leafpress-units-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

type UnitContext = Pick<
  CodeStepContext,
  "folder" | "setting" | "secret" | "exec" | "heartbeat"
> & { account: { id: string } };

/** 只带这些单元测试用得到的字段的步骤上下文 */
function context(
  overrides: {
    settings?: Record<string, string>;
    secret?: string;
    taskFolder?: string;
    accountId?: string;
    exec?: CodeStepContext["exec"];
  } = {},
): UnitContext {
  return {
    folder: overrides.taskFolder ?? join(folder, "tasks", "b-1"),
    account: { id: overrides.accountId ?? "blog-1" },
    setting: (key: string) => overrides.settings?.[key],
    secret: () => overrides.secret,
    exec: overrides.exec ?? (() => Promise.resolve(ok())),
    heartbeat: () => undefined,
  };
}

describe("blogStepConfig", () => {
  it("读仓库位置和站点地址，站点地址去掉末尾的斜杠", () => {
    const result = blogStepConfig(
      context({
        settings: {
          "repo-path": "  C:\\code\\yeton-blog  ",
          "site-url": " https://blog.example.test/// ",
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.siteUrl).toBe("https://blog.example.test");
      expect(result.config.repo.endsWith("yeton-blog")).toBe(true);
    }
  });

  it("数据目录是任务文件夹往上两层，检出目录在数据目录的 blog-checkout/<账号编号>", () => {
    const ctx = context({
      settings: { "repo-path": "/r", "site-url": "https://x.test" },
    });

    expect(dataHome(ctx)).toBe(folder);
    const result = blogStepConfig(ctx);
    expect(result.ok && result.config.home).toBe(folder);
    expect(result.ok && result.config.checkoutDir).toBe(
      join(folder, "blog-checkout", "blog-1"),
    );
  });

  it("缺仓库位置、缺站点地址：各自说清楚缺哪个（先查仓库位置）", () => {
    expect(
      blogStepConfig(context({ settings: { "site-url": "https://x.test" } })),
    ).toEqual({
      ok: false,
      outcome: { kind: "fail", error: "博客仓库位置还没配" },
    });
    expect(
      blogStepConfig(context({ settings: { "repo-path": "/r" } })),
    ).toEqual({
      ok: false,
      outcome: { kind: "fail", error: "站点地址还没配" },
    });
    expect(blogStepConfig(context())).toEqual({
      ok: false,
      outcome: { kind: "fail", error: "博客仓库位置还没配" },
    });
  });

  it("账号编号不安全：不抛异常，按失败返回", () => {
    const result = blogStepConfig(
      context({
        accountId: "../evil",
        settings: { "repo-path": "/r", "site-url": "https://x.test" },
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("抹密钥", () => {
  it("密钥和网址里的账号口令都抹掉", () => {
    const ctx = context({ secret: "umami-secret-value" });
    const text = redactBlogText(
      ctx,
      "带着 umami-secret-value 访问 https://user:pw123@example.test/a",
    );
    expect(text).not.toContain("umami-secret-value");
    expect(text).not.toContain("pw123");
    expect(text).toContain("<redacted>");
  });

  it("stepFailure 把错误信息抹干净后放进 fail", () => {
    const ctx = context({ secret: "umami-secret-value" });
    expect(stepFailure(ctx, new Error("坏了 umami-secret-value"))).toEqual({
      kind: "fail",
      error: "坏了 <redacted>",
    });
    expect(stepFailure(ctx, "字符串错误")).toEqual({
      kind: "fail",
      error: "字符串错误",
    });
  });
});

describe("检查凭据文件", () => {
  const record = {
    passed: true as const,
    slug: "my-post",
    hash: "a".repeat(64),
    base: "b".repeat(40),
    checkedAt: "2026-10-08T01:00:00.000Z",
  };

  it("写了能读回来", async () => {
    writeGateRecord(folder, record);
    expect(await readGateRecord(folder)).toEqual(record);
  });

  it.each([
    ["文件不存在", undefined],
    ["不是 JSON", "{坏了"],
    ["passed 不是 true", JSON.stringify({ ...record, passed: false })],
    ["缺 hash", JSON.stringify({ ...record, hash: undefined })],
    ["缺 base（旧版本写的）", JSON.stringify({ ...record, base: undefined })],
    ["是个数组", "[]"],
  ])("%s：当作没有", async (_name, content) => {
    if (content !== undefined)
      await writeFile(join(folder, ".gate.json"), content, "utf8");
    expect(await readGateRecord(folder)).toBeUndefined();
  });

  it("重新检查前作废上一轮的凭据和报告；重新推送前作废推送凭据", async () => {
    writeGateRecord(folder, record);
    writeCheckReport(folder, "上一轮\n");
    writePublishRecord(folder, {
      slug: "my-post",
      commit: "c".repeat(40),
      pushedAt: "2026-10-08T01:00:00.000Z",
    });

    await clearGateOutputs(folder);
    expect(await exists(join(folder, ".gate.json"))).toBe(false);
    expect(await exists(join(folder, "检查结果.txt"))).toBe(false);
    expect(await exists(join(folder, ".publish.json"))).toBe(true);

    await clearPublishRecord(folder);
    expect(await exists(join(folder, ".publish.json"))).toBe(false);
    // 本来就没有也不报错
    await clearGateOutputs(folder);
    await clearPublishRecord(folder);
  });

  it("推送凭据写成带缩进的 JSON，字段是 slug、commit、pushedAt", async () => {
    writePublishRecord(folder, {
      slug: "my-post",
      commit: "c".repeat(40),
      pushedAt: "2026-10-08T01:00:00.000Z",
    });
    expect(
      JSON.parse(await readFile(join(folder, ".publish.json"), "utf8")),
    ).toEqual({
      slug: "my-post",
      commit: "c".repeat(40),
      pushedAt: "2026-10-08T01:00:00.000Z",
    });
  });
});

describe("检查结果的整理", () => {
  it("lastLines 取最后几行并去掉首尾空白", () => {
    expect(lastLines("a\nb\nc\nd\n", 2)).toBe("c\nd");
    expect(lastLines("a\r\nb\r\nc", 2)).toBe("b\nc");
    expect(lastLines("", 5)).toBe("");
  });

  it("全过：每项通过和用时", () => {
    expect(
      formatReport([
        { name: "prettier 排版", passed: true, elapsedMs: 1234 },
        { name: "content:check", passed: true, elapsedMs: 10_700 },
      ]),
    ).toBe(
      "博客检查：全过\nprettier 排版：通过（1.2 秒）\ncontent:check：通过（10.7 秒）\n",
    );
  });

  it("有一项没过：只给第一个没过的附最后 80 行输出", () => {
    const report = formatReport([
      { name: "content:check", passed: true, elapsedMs: 1000 },
      {
        name: "format:check",
        passed: false,
        elapsedMs: 2500,
        tail: "文件没排好版",
      },
    ]);
    expect(report).toBe(
      "博客检查：没过\ncontent:check：通过（1.0 秒）\nformat:check：没过（2.5 秒）\n\nformat:check 最后 80 行输出：\n文件没排好版\n",
    );
  });
});
