/**
 * Generate the four Xiaohongshu card theme samples with the local Edge renderer.
 * Run: pnpm exec tsx scripts/xhs-theme-samples.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEdgeCardRenderer } from "../src/platforms/xiaohongshu/cards/edge.js";
import {
  THEME_BOLD,
  THEME_DARK,
  THEME_PAPER,
} from "../src/platforms/xiaohongshu/cards/themes.js";
import type {
  CardDeck,
  CardTheme,
} from "../src/platforms/xiaohongshu/cards/types.js";
import { DEFAULT_THEME } from "../src/platforms/xiaohongshu/cards/types.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(ROOT_DIR, "docs", "前端设计", "示意图", "小红书卡片");

const SAMPLE_DECK: CardDeck = {
  pages: [
    {
      kind: "cover",
      title: "AI 写代码，先把规格写清",
      lines: ["让需求从“差不多”变成可验证"],
    },
    {
      kind: "point",
      title: "先描述结果，不指定套路",
      lines: [
        "说明谁会用、要完成什么任务",
        "列出输入、输出和关键规则",
        "把成功状态写成可观察结果",
      ],
    },
    {
      kind: "point",
      title: "补上边界和验收条件",
      lines: [
        "说明空值、错误和极端输入怎么处理",
        "给出至少一个正常和异常示例",
        "用可检查的条件定义“完成”",
      ],
    },
    {
      kind: "summary",
      title: "总结：规格要能直接验收",
      lines: ["目标说结果，规则覆盖边界", "用样例和条件，让 AI 自查也让人复核"],
    },
  ],
};

const SAMPLES: { name: string; theme: CardTheme }[] = [
  { name: "默认", theme: DEFAULT_THEME },
  { name: "纸感", theme: THEME_PAPER },
  { name: "醒目", theme: THEME_BOLD },
  { name: "深色技术", theme: THEME_DARK },
];

function pngSize(path: string): { width: number; height: number } {
  const image = readFileSync(path);
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (!image.subarray(0, 8).equals(signature)) {
    throw new Error(`不是有效的 PNG：${path}`);
  }
  if (image.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`PNG 缺少 IHDR：${path}`);
  }
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

function leftoverEdgePids(tempRoot: string): number[] {
  const escapedRoot = tempRoot.replaceAll("'", "''");
  const script =
    `$root = '${escapedRoot}'; ` +
    "Get-CimInstance Win32_Process | " +
    "Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -and $_.CommandLine.Contains($root) } | " +
    "ForEach-Object { $_.ProcessId }";
  const output = execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20_000,
      windowsHide: true,
    },
  );
  return output
    .trim()
    .split(/\r?\n/)
    .filter((pid) => /^\d+$/.test(pid))
    .map(Number);
}

async function assertNoLeftoverEdge(tempRoot: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const pids = leftoverEdgePids(tempRoot);
    if (pids.length === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  const pids = leftoverEdgePids(tempRoot);
  if (pids.length > 0) {
    throw new Error(`Edge 进程未退出：${pids.join(", ")}`);
  }
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("样张脚本需要在 Windows 上运行本机 Edge");
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "leafpress-xhs-samples-"));
  try {
    for (const sample of SAMPLES) {
      const outDir = join(OUTPUT_ROOT, sample.name);
      mkdirSync(outDir, { recursive: true });
      const result = await createEdgeCardRenderer({ tempRoot }).render(
        SAMPLE_DECK,
        outDir,
        { theme: sample.theme },
      );
      const expectedFiles = SAMPLE_DECK.pages.map(
        (_, index) => `${String(index + 1).padStart(2, "0")}.png`,
      );
      if (JSON.stringify(result.files) !== JSON.stringify(expectedFiles)) {
        throw new Error(`${sample.name}：出图文件不完整`);
      }
      for (const file of result.files) {
        const path = join(outDir, file);
        const size = pngSize(path);
        if (size.width !== 1080 || size.height !== 1440) {
          throw new Error(`${path} 尺寸错误：${size.width}×${size.height}`);
        }
      }
      console.log(
        `${relative(ROOT_DIR, outDir)}：${result.files.length} 张，1080×1440，${result.millis}ms`,
      );
    }

    await assertNoLeftoverEdge(tempRoot);
    console.log("Edge 进程检查通过：没有本次出图遗留的 msedge.exe。");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

await main();
