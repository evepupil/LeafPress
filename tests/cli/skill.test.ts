import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../../src/cli/context.js";
import {
  executeSkillInstall,
  renderSkillInstall,
} from "../../src/cli/commands/skill.js";

let tempDir: string | undefined;
afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("skill install", () => {
  it("默认只安装到 Claude，已有目标跳过，force 覆盖", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-skill-"));
    const userHome = join(tempDir, "user");
    const source = join(tempDir, "source");
    await mkdir(source);
    await writeFile(join(source, "SKILL.md"), "new skill", "utf8");
    const context = createCliContext(
      {},
      { env: {}, homedir: userHome, skillSourceDir: source },
    );
    const first = executeSkillInstall(context);
    const claude = join(userHome, ".claude", "skills", "leafpress");
    expect(first.targets).toEqual([{ path: claude, action: "installed" }]);
    expect(await readFile(join(claude, "SKILL.md"), "utf8")).toBe("new skill");

    const skipped = executeSkillInstall(context);
    expect(skipped.targets[0]?.action).toBe("skipped");
    expect(renderSkillInstall(skipped)).toContain("已存在，加 --force 覆盖");
    await writeFile(join(source, "SKILL.md"), "updated", "utf8");
    const forced = executeSkillInstall(context, true);
    expect(forced.targets[0]?.action).toBe("installed");
    expect(await readFile(join(claude, "SKILL.md"), "utf8")).toBe("updated");
  });

  it("只在 CODEX_HOME 已存在時加裝 Codex 目標", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-codex-"));
    const userHome = join(tempDir, "user");
    const codexHome = join(tempDir, "codex");
    const source = join(tempDir, "source");
    await mkdir(source);
    await writeFile(join(source, "SKILL.md"), "skill", "utf8");
    const env = { CODEX_HOME: codexHome };
    const context = createCliContext(
      {},
      { env, homedir: userHome, skillSourceDir: source },
    );
    expect(executeSkillInstall(context).targets).toHaveLength(1);
    await mkdir(codexHome);
    const installed = executeSkillInstall(context);
    expect(installed.targets.map((target) => target.action)).toEqual([
      "skipped",
      "installed",
    ]);
    expect(existsSync(join(codexHome, "skills", "leafpress", "SKILL.md"))).toBe(
      true,
    );
  });

  it("仓库缺少 skill 源目录时不触碰目标", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-cli-skill-missing-"));
    const source = join(tempDir, "missing");
    const context = createCliContext(
      {},
      { env: {}, homedir: join(tempDir, "user"), skillSourceDir: source },
    );
    expect(() => executeSkillInstall(context)).toThrow(
      "仓库里没有 skills/leafpress",
    );
    expect(existsSync(join(tempDir, "user"))).toBe(false);
  });
});
