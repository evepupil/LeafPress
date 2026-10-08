import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { writeFileAtomic } from "../../src/files/atomic.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("原子文件写入", () => {
  it("读进程持续打开目标文件时，连续 100 次替换均成功", async () => {
    const dir = await mkdtemp(join(tmpdir(), "leafpress-atomic-reader-"));
    dirs.push(dir);
    const file = join(dir, "状态.json");
    const stopFile = `${file}.stop`;
    writeFileAtomic(file, "revision-0");

    const worker = fileURLToPath(
      new URL("./atomic-reader-worker.ts", import.meta.url),
    );
    const project = fileURLToPath(new URL("../../", import.meta.url));
    const child = spawn(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), worker, file, "10000"],
      { cwd: project, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `reader failed: ${String(code)} ${String(signal)} ${stderr}`,
            ),
          );
      });
    });
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`reader did not start: ${stderr}`)),
        5_000,
      );
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        if (!output.includes("READY"))
          reject(
            new Error(
              `reader exited before ready: ${String(code)} ${String(signal)} ${stderr}`,
            ),
          );
      });
    });

    try {
      await ready;
      for (let revision = 1; revision <= 100; revision += 1)
        writeFileAtomic(file, `revision-${revision}`);
    } finally {
      await writeFile(stopFile, "stop", "utf8");
      await exited;
    }
    expect(await readFile(file, "utf8")).toBe("revision-100");
  }, 20_000);
});
