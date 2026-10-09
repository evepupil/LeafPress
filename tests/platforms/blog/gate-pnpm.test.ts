/**
 * 运行 LeafPress 的环境里 PATH 没有 pnpm（Windows 上经 cmd.exe 起 pnpm 的写法）：
 * 原来 cmd.exe 自己正常退出，只留一句按系统代码页输出的「不是内部或外部命令」，被当成 UTF-8 解成乱码，
 * 提示还写着「先在博客仓库里运行 pnpm install」，方向指错了。
 * 现在第一次用 pnpm 之前先探测它在不在，不在就直接说清楚。
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { prepareCheckout } from "../../../src/platforms/blog/checkout.js";
import { gateBlogDraft } from "../../../src/platforms/blog/steps/gate.js";
import { publishBlogDraft } from "../../../src/platforms/blog/steps/publish.js";
import type { ExecFn } from "../../../src/shared/exec.js";
import {
  type BlogFixture,
  exists,
  makeBlogFixture,
  writeGate,
} from "./steps-fixtures.js";

const NOT_FOUND = "找不到 pnpm：运行 LeafPress 的环境里 PATH 没有 pnpm";
const onWindows = process.platform === "win32";

async function withFixture(
  run: (fixture: BlogFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeBlogFixture();
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

describe("PATH 里没有 pnpm", () => {
  it.runIf(onWindows)(
    "gate：直接失败，说清是 PATH 里没有 pnpm（不是乱码，也不叫人去博客仓库装依赖）；一条真的 pnpm 命令都没起",
    async () => {
      await withFixture(async (fixture) => {
        fixture.pnpm.missing = true;

        const outcome = await gateBlogDraft(fixture.ctx);

        expect(outcome).toEqual({ kind: "fail", error: NOT_FOUND });
        expect(fixture.pnpm.probes).toBe(1);
        expect(fixture.pnpm.calls).toEqual([]);
        expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
        expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
      });
    },
    60_000,
  );

  it.runIf(onWindows)(
    "依赖早就装好、不用再装的时候也一样：第一条检查命令之前就失败，不会变成「prettier 排版没过」",
    async () => {
      await withFixture(async (fixture) => {
        // 先用另一个执行函数把检出目录和依赖准备好；探测结果按执行函数记，所以 gate 用的那个还没探测过
        const other: ExecFn = (command, args, options) =>
          fixture.ctx.exec(command, args, options);
        await prepareCheckout({
          repo: fixture.repo,
          dir: fixture.checkoutDir,
          exec: other,
        });
        fixture.pnpm.missing = true;
        const before = fixture.pnpm.calls.length;

        const outcome = await gateBlogDraft(fixture.ctx);

        expect(outcome).toEqual({ kind: "fail", error: NOT_FOUND });
        expect(fixture.pnpm.calls).toHaveLength(before);
        // 没有留下看着像「某一项没过」的检查结果
        expect(await exists(join(fixture.folder, "检查结果.txt"))).toBe(false);
        expect(await exists(join(fixture.folder, ".gate.json"))).toBe(false);
      });
    },
    60_000,
  );

  it.runIf(onWindows)(
    "publish：同样直接失败，什么都没提交没推送",
    async () => {
      await withFixture(async (fixture) => {
        await writeGate(fixture);
        fixture.pnpm.missing = true;
        const before = await fixture.remoteHead();

        const outcome = await publishBlogDraft(fixture.ctx);

        expect(outcome).toEqual({ kind: "fail", error: NOT_FOUND });
        expect(await fixture.remoteHead()).toBe(before);
        expect(await exists(join(fixture.folder, ".publish.json"))).toBe(false);
        expect(await readdir(join(fixture.home, "locks"))).toEqual([]);
      });
    },
    60_000,
  );

  it("pnpm 在的时候整个 gate 只探测一次（结果记在本进程里），不是每条 pnpm 命令都探测", async () => {
    await withFixture(async (fixture) => {
      const outcome = await gateBlogDraft(fixture.ctx);

      expect(outcome.kind).toBe("done");
      // 装依赖、排版、三项检查共 5 条 pnpm 命令
      expect(fixture.pnpm.calls).toHaveLength(5);
      expect(fixture.pnpm.probes).toBe(onWindows ? 1 : 0);
    });
  }, 90_000);
});
