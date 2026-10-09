import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { psLiteral } from "../../src/schedule/ps-literal.js";
import { buildWrapperScript } from "../../src/schedule/wrapper.js";
import {
  REPLACEMENT_CHAR,
  runPowerShellFile,
  writePowerShellFile,
} from "./support.js";

const notWindows = process.platform !== "win32";
const curly = String.fromCodePoint(0x2019);

describe.skipIf(notWindows)("启动脚本在真实 PowerShell 里运行", () => {
  it("node 起不来：退出码是 1，原因写进错误日志（日志目录原本不存在也行）", async () => {
    const directory = await mkdtemp(join(tmpdir(), "leafpress wrapper miss-"));
    try {
      const nodePath = join(directory, "no-such-dir", "node.exe");
      const script = join(directory, "run-data-pull.ps1");
      await writePowerShellFile(
        script,
        buildWrapperScript({
          nodePath,
          entryPath: join(directory, "main.js"),
          homePath: directory,
        }),
      );

      const result = await runPowerShellFile(script);

      // 以前这里是 0：计划任务记成功、不触发失败重试
      expect(result.exitCode).toBe(1);
      const log = await readFile(
        join(directory, "logs", "data-pull.err.log"),
        "utf8",
      );
      console.info("node 起不来时的错误日志：", log);
      const prefix = `无法启动 node（${nodePath}）：`;
      expect(log.startsWith(prefix)).toBe(true);
      expect(log.length).toBeGreaterThan(prefix.length);
      expect(log).not.toContain(REPLACEMENT_CHAR);
      // \u548C node \u81EA\u5DF1\u5199\u8FDB\u65E5\u5FD7\u7684\u5185\u5BB9\u4E00\u6837\uFF0C\u662F\u4E0D\u5E26 BOM \u7684 UTF-8
      expect(log.charCodeAt(0)).not.toBe(0xfeff);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);

  it("路径里有弯单引号：照样能起 node，参数、输出和退出码都照传", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), `leafpress${curly}s wrapper ok-`),
    );
    try {
      await mkdir(join(directory, "logs"), { recursive: true });
      const entryPath = join(directory, `main${curly}s.js`);
      // 假入口：把收到的参数打到标准输出，再以 7 退出
      await writeFile(
        entryPath,
        "console.log(JSON.stringify(process.argv.slice(1))); process.exit(7);",
        "utf8",
      );
      const script = join(directory, "run-data-pull.ps1");
      await writePowerShellFile(
        script,
        buildWrapperScript({
          nodePath: process.execPath,
          entryPath,
          homePath: directory,
        }),
      );

      const result = await runPowerShellFile(script);

      expect(result.exitCode).toBe(7);
      const output = await readFile(
        join(directory, "logs", "data-pull.out.log"),
        "utf8",
      );
      expect(JSON.parse(output)).toEqual([
        entryPath,
        "data",
        "pull",
        "--scheduled",
        "--home",
        directory,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});

describe.skipIf(notWindows)("单引号字面量交给真实 PowerShell 解析", () => {
  it("含 ASCII 单引号和四种弯单引号的字符串能原样读回", async () => {
    const [left, right, low, high] = [0x2018, 0x2019, 0x201a, 0x201b].map(
      (code) => String.fromCodePoint(code),
    );
    const samples = [
      "C:\\Users\\周涛\\O'Brien",
      `C:\\Users\\周涛\\it${right}s a path`,
      `${left}left${right} ${low}low${high} high 'ascii'`,
      `${right}leading`,
      `trailing${right}`,
      `mixed ${right}' pair ${left}${right}`,
      "'''",
      `${right}${right}${right}`,
      "无引号 plain 中文",
    ];
    const directory = await mkdtemp(join(tmpdir(), "leafpress literal-"));
    try {
      // 每个字符串先写成字面量赋给变量，再转 base64 输出：和代码页无关，读回的就是 PowerShell 解析出的值
      const lines = samples.map(
        (value, index) => `$s${index} = ${psLiteral(value)}`,
      );
      lines.push(
        `@(${samples.map((_, index) => `$s${index}`).join(",")}) | ForEach-Object { [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_))) }`,
      );
      const script = join(directory, "literal.ps1");
      await writePowerShellFile(script, lines.join("\n"));

      const result = await runPowerShellFile(script);

      expect(result.exitCode).toBe(0);
      const parsed = result.stdout
        .split(/\r?\n/u)
        .filter((line) => line.length > 0)
        .map((line) => Buffer.from(line, "base64").toString("utf8"));
      expect(parsed).toEqual(samples);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
