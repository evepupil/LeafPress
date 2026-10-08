import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CliContext } from "../context.js";
import { resolveCodexHome } from "../context.js";
import { LeafPressError } from "../../shared/errors.js";
import { commandOptions, emitSuccess } from "./shared.js";

export interface SkillTarget {
  readonly path: string;
  readonly action: "installed" | "skipped";
}

export function executeSkillInstall(
  context: CliContext,
  force = false,
): { targets: SkillTarget[] } {
  const source = context.skillSourceDir;
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new LeafPressError("NOT_FOUND", "仓库里没有 skills/leafpress");
  }
  const destinations = [
    join(context.homedir, ".claude", "skills", "leafpress"),
  ];
  const codexHome = resolveCodexHome(context);
  if (existsSync(codexHome) && statSync(codexHome).isDirectory()) {
    destinations.push(join(codexHome, "skills", "leafpress"));
  }
  const targets = destinations.map((path): SkillTarget => {
    if (existsSync(path) && !force) return { path, action: "skipped" };
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
    cpSync(source, path, { recursive: true });
    return { path, action: "installed" };
  });
  return { targets };
}

export function renderSkillInstall(result: {
  targets: readonly SkillTarget[];
}): string {
  return result.targets
    .map(({ path, action }) =>
      action === "installed"
        ? `已装到 ${path}`
        : `已存在，加 --force 覆盖：${path}`,
    )
    .join("\n");
}

export function run(
  context: CliContext,
  args: readonly unknown[],
): Promise<void> {
  const force = commandOptions(args)["force"] === true;
  const result = executeSkillInstall(context, force);
  emitSuccess(context, result, renderSkillInstall(result));
  return Promise.resolve();
}
