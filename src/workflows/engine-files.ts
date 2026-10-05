import { access, mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

import { LeafPressError } from "../shared/errors.js";
import { sha256File } from "../shared/hash.js";

export async function hashInputFiles(
  paths: readonly string[],
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const path of paths) hashes[path] = await sha256File(path);
  return hashes;
}

export async function inputHashesMatch(
  hashes: Readonly<Record<string, string>>,
): Promise<boolean> {
  for (const [path, expected] of Object.entries(hashes)) {
    const actual = await sha256File(path);
    if (actual !== expected) return false;
  }
  return true;
}

export async function prepareStepDirectory(
  runDir: string,
  stepId: string,
  attempts: number,
  clean: boolean,
): Promise<string> {
  const stepDir = join(runDir, stepId);
  try {
    await mkdir(runDir, { recursive: true });
    if (clean && (await isNonEmptyDirectory(stepDir))) {
      let suffix = 0;
      let archiveDir: string;
      do {
        const serial = suffix === 0 ? "" : `-${suffix}`;
        archiveDir = join(runDir, `${stepId}.old-${attempts}${serial}`);
        suffix += 1;
      } while (await exists(archiveDir));
      await rename(stepDir, archiveDir);
    }
    await mkdir(stepDir, { recursive: true });
    return stepDir;
  } catch (error) {
    if (error instanceof LeafPressError) throw error;
    throw new LeafPressError(
      "INTERNAL",
      `无法准备步骤「${stepId}」的工作目录`,
      { cause: error },
    );
  }
}

async function isNonEmptyDirectory(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
