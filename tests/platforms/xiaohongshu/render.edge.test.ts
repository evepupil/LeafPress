import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createEdgeCardRenderer } from "../../../src/platforms/xiaohongshu/cards/edge.js";
import {
  DEFAULT_THEME,
  type CardDeck,
} from "../../../src/platforms/xiaohongshu/cards/types.js";

/** 真起本机 Edge 的测试只在 Windows 上跑 */
describe.skipIf(process.platform !== "win32")(
  "Edge 出图（真起本机 Edge）",
  () => {
    /** 三张：封面 + 要点 + 总结 */
    function makeDeck(pageCount: number): CardDeck {
      const pages: CardDeck["pages"] = [
        {
          kind: "cover",
          title: "封面这一句：勾人的一句话",
          lines: ["副标题一行"],
        },
      ];
      for (let i = 1; i <= pageCount - 2; i++) {
        pages.push({
          kind: "point",
          title: `要点${i}的标题`,
          lines: [
            `第${i}页的第一条内容`,
            `第${i}页的第二条内容`,
            `第${i}页的第三条内容`,
          ],
        });
      }
      pages.push({
        kind: "summary",
        title: "总结：一次讲清",
        lines: ["回顾一下这一篇"],
      });
      return { pages };
    }

    /** PNG 宽高在文件头：8 字节签名 + IHDR 块，宽在偏移 16、高在 20，大端 */
    function pngSize(path: string): { width: number; height: number } {
      const buf = readFileSync(path);
      expect([...buf.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    /** 命令行里带本次唯一临时根目录的 msedge 进程数（0 才算干净） */
    function leftoverEdgeCount(tempRoot: string): number {
      const escapedRoot = tempRoot.replaceAll("'", "''");
      const script =
        `$root = '${escapedRoot}'; ` +
        "Get-CimInstance Win32_Process | " +
        "Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine.Contains($root) } | " +
        "ForEach-Object { $_.ProcessId }";
      const out = execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          timeout: 20_000,
        },
      );
      return out
        .trim()
        .split(/\r?\n/)
        .filter((pid) => /^\d+$/.test(pid)).length;
    }

    /** taskkill 是同步的，理论上 render 返回时就该收干净；留几秒缓冲给 Windows 撤进程 */
    async function waitNoLeftover(tempRoot: string): Promise<void> {
      for (let i = 0; i < 10; i++) {
        if (leftoverEdgeCount(tempRoot) === 0) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(
        leftoverEdgeCount(tempRoot),
        "残留的、命令行带本次 tempRoot 的 msedge 进程",
      ).toBe(0);
    }

    /** 跑一次出图，量冷启动 / 每张 / 总用时，并做全部断言 */
    async function runOnce(pageCount: number): Promise<void> {
      const tempRoot = mkdtempSync(join(tmpdir(), "leafpress-edge-test-root-"));
      try {
        const outDir = mkdtempSync(join(tempRoot, "output-"));
        let heartbeats = 0;
        const started = Date.now();
        const result = await createEdgeCardRenderer({ tempRoot }).render(
          makeDeck(pageCount),
          outDir,
          {
            heartbeat: () => {
              heartbeats++;
            },
          },
        );

        // 文件名按页序，一个个都在
        expect(result.files).toEqual(
          Array.from(
            { length: pageCount },
            (_, i) => `${String(i + 1).padStart(2, "0")}.png`,
          ),
        );
        for (const name of result.files) {
          expect(existsSync(join(outDir, name)), `${name} 要存在`).toBe(true);
        }
        // 尺寸正好是画布大小
        for (const name of result.files) {
          expect(pngSize(join(outDir, name))).toEqual({
            width: DEFAULT_THEME.width,
            height: DEFAULT_THEME.height,
          });
        }
        // 每截一张续一次租约
        expect(heartbeats).toBe(pageCount);

        // 用时：冷启动 = 起到第一张落盘；每张 = 后续张的平均间隔；总 = render 返回的 millis
        const mtimes = result.files.map(
          (name) => statSync(join(outDir, name)).mtimeMs,
        );
        const coldMs = mtimes[0]! - started;
        const restMs = mtimes[mtimes.length - 1]! - mtimes[0]!;
        const perCardMs = pageCount > 1 ? restMs / (pageCount - 1) : restMs;
        expect(result.millis).toBeGreaterThan(0);
        console.log(
          `[edge 出图] ${pageCount} 张：冷启动 ${coldMs.toFixed(0)}ms，每张 ${perCardMs.toFixed(0)}ms，总 ${result.millis}ms`,
        );

        await waitNoLeftover(tempRoot);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }

    it(
      "3 张：文件、1080×1440、跑完没残留进程",
      { timeout: 120_000 },
      async () => {
        await runOnce(3);
      },
    );

    it(
      "9 张：文件、1080×1440、跑完没残留进程",
      { timeout: 120_000 },
      async () => {
        await runOnce(9);
      },
    );
  },
);
