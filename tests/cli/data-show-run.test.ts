import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UseCases } from "@leafpress/core";
import { afterEach, describe, expect, it } from "vitest";
import { run as runData } from "../../src/cli/commands/data.js";
import { createCliContext } from "../../src/cli/context.js";
import { buildProgram } from "../../src/cli/main.js";
import { LeafPressError } from "../../src/shared/errors.js";
import { fakeUseCases } from "./data-show-fixtures.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function makeContext(options: { json: boolean; useCases?: UseCases }) {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-data-show-"));
  return createCliContext(
    { home: join(tempDir, "home"), json: options.json },
    {
      env: {},
      homedir: tempDir,
      ...(options.useCases === undefined ? {} : { useCases: options.useCases }),
    },
  );
}

async function capture(run: () => Promise<void>): Promise<string> {
  const write = process.stdout.write.bind(process.stdout);
  let stdout = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout += chunk.toString();
    return true;
  };
  try {
    await run();
    return stdout;
  } finally {
    process.stdout.write = write;
  }
}

interface ShownJson {
  ok: boolean;
  hasData: boolean;
  summaries: { account: { id: string } }[];
  series: { reads: { points: unknown[] } };
  top: { work: { id: string } }[];
}

/** --account zhihu-1 --range 4w --top 1 --by interactions 的预期：只有知乎号、28 个点、互动最多的一篇 */
function expectScopedResult(stdout: string): void {
  const shown = JSON.parse(stdout) as ShownJson;
  expect(shown.ok).toBe(true);
  expect(shown.hasData).toBe(true);
  expect(shown.summaries.map((summary) => summary.account.id)).toEqual([
    "zhihu-1",
  ]);
  expect(shown.series.reads.points).toHaveLength(28);
  // 默认按浏览排，第一篇是 w-second；换成按互动排，第一篇变成 w-first，且只留 1 条
  expect(shown.top.map((item) => item.work.id)).toEqual(["w-first"]);
}

describe("leafpress data show：命令行参数交给计算的那一段", () => {
  it("run 把 --account、--range、--top、--by 交给计算", async () => {
    const context = await makeContext({
      json: true,
      useCases: fakeUseCases(),
    });
    const stdout = await capture(() =>
      runData(context, [
        "show",
        { account: "zhihu-1", range: "4w", top: "1", by: "interactions" },
      ]),
    );
    expectScopedResult(stdout);
  });

  it("从 commander 解析到 run：选项名和取值都对得上", async () => {
    const program = buildProgram({
      createContext: (globalOptions) =>
        makeContext({
          json: globalOptions.json === true,
          useCases: fakeUseCases(),
        }),
    });
    const stdout = await capture(async () => {
      await program.parseAsync(
        [
          "--json",
          "data",
          "show",
          "--account",
          "zhihu-1",
          "--range",
          "4w",
          "--top",
          "1",
          "--by",
          "interactions",
        ],
        { from: "user" },
      );
    });
    expectScopedResult(stdout);
  });

  it("人看的输出：账号没有数据时只有一句话", async () => {
    const context = await makeContext({
      json: false,
      useCases: fakeUseCases(),
    });
    const stdout = await capture(() =>
      runData(context, ["show", { account: "blog-1" }]),
    );
    expect(stdout).toBe("这个账号还没有数据\n");
  });

  it("参数写错先报用法错误，不必先打开记录库", async () => {
    // 数据目录还没初始化：参数是对的会报「还没初始化」，参数是错的应先报参数
    const context = await makeContext({ json: true });
    await expect(runData(context, ["show", {}])).rejects.toThrow("还没初始化");
    for (const [options, message] of [
      [{ range: "8w" }, "--range 不合法：8w；可选值：4w、12w"],
      [
        { by: "views" },
        "--by 不合法：views；可选值：reach、interactions、growth",
      ],
      [{ top: "0" }, "--top 必须是正整数：0"],
    ] as const) {
      const failure: unknown = await runData(context, ["show", options]).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(LeafPressError);
      expect((failure as LeafPressError).code).toBe("USAGE");
      expect((failure as LeafPressError).message).toBe(message);
    }
  });
});
