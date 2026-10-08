import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { HomePaths } from "../config/home.js";
import { writeFileAtomic } from "./atomic.js";
import { assertSafeId } from "./ids.js";

export function profilePath(paths: HomePaths, accountId: string): string {
  assertSafeId(accountId);
  return join(paths.accountsDir, `${accountId}.md`);
}

export function readProfile(paths: HomePaths, accountId: string): string {
  const file = profilePath(paths, accountId);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

export function writeProfile(
  paths: HomePaths,
  accountId: string,
  text: string,
): void {
  const normalized = text.trimEnd();
  const content = normalized.length === 0 ? "" : `${normalized}\n`;
  writeFileAtomic(profilePath(paths, accountId), content);
}

export function profilesStamp(paths: HomePaths): number {
  if (!existsSync(paths.accountsDir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(paths.accountsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    newest = Math.max(
      newest,
      Math.trunc(statSync(join(paths.accountsDir, entry.name)).mtimeMs),
    );
  }
  return newest;
}
