/**
 * 子进程输出的解码：先按 UTF-8 严格解码，不是合法 UTF-8 再按 GB18030 解码。
 * 现实中的场景：Windows 上找不到 pnpm 时，cmd.exe 按系统代码页（中文系统是 936，即 GBK）
 * 输出「'pnpm' 不是内部或外部命令」，不能被当成 UTF-8 解成乱码。
 */
import { describe, expect, it } from "vitest";

import { decodeOutput } from "../../src/shared/decode-output.js";
import { execCommand } from "../../src/shared/exec.js";

/** 「不是内部或外部命令」的 GBK 字节（cmd.exe 在 936 代码页下输出的就是这样） */
const GBK_BYTES = [
  0xb2, 0xbb, 0xca, 0xc7, 0xc4, 0xda, 0xb2, 0xbf, 0xbb, 0xf2, 0xcd, 0xe2, 0xb2,
  0xbf, 0xc3, 0xfc, 0xc1, 0xee,
];

describe("decodeOutput", () => {
  it("UTF-8 字节：原样解出，包括中文和 emoji", () => {
    const text = "检查通过 ✓ 構建 🎉\n";
    expect(decodeOutput(Buffer.from(text, "utf8"))).toBe(text);
  });

  it("GBK 字节（不是合法 UTF-8）：按 GB18030 解出中文，不是乱码", () => {
    expect(decodeOutput(Uint8Array.from(GBK_BYTES))).toBe("不是内部或外部命令");
  });

  it("纯 ASCII 两种编码一样，空输出得到空字符串", () => {
    expect(decodeOutput(Buffer.from("ok 123"))).toBe("ok 123");
    expect(decodeOutput(new Uint8Array())).toBe("");
  });

  it("UTF-8 的 BOM 保留（和原来 Buffer.toString 的行为一致）", () => {
    expect(
      decodeOutput(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a")]),
      ),
    ).toBe(String.fromCharCode(0xfeff) + "a");
  });

  it("合法 UTF-8 优先：不会因为恰好也能按 GBK 解就解成别的字", () => {
    // 「你好」的 UTF-8 字节 e4 bd a0 e5 a5 bd，按 GBK 解会变成 浣犲ソ
    expect(decodeOutput(Buffer.from("你好", "utf8"))).toBe("你好");
  });
});

/** 让子进程把原始字节写到标准输出和标准错误，再看 execCommand 解出什么 */
function writeBytes(stdout: number[], stderr: number[]): string[] {
  return [
    "-e",
    `process.stdout.write(Buffer.from(${JSON.stringify(stdout)}));` +
      `process.stderr.write(Buffer.from(${JSON.stringify(stderr)}));`,
  ];
}

describe.each([false, true])(
  "execCommand 的输出解码（killTree=%s）",
  (killTree) => {
    it("子进程输出 GBK 字节：stdout、stderr 都解成正确的中文", async () => {
      const result = await execCommand(
        process.execPath,
        writeBytes(GBK_BYTES, GBK_BYTES),
        { killTree },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("不是内部或外部命令");
      expect(result.stderr).toBe("不是内部或外部命令");
    });

    it("子进程输出 UTF-8 字节：照常解出", async () => {
      const bytes = [...Buffer.from("构建完成 ✓", "utf8")];
      const result = await execCommand(
        process.execPath,
        writeBytes(bytes, bytes),
        { killTree },
      );
      expect(result.stdout).toBe("构建完成 ✓");
      expect(result.stderr).toBe("构建完成 ✓");
    });

    it("一个多字节字符被拆在两次写入之间：照样解对", async () => {
      // 「好」的 UTF-8 是 e5 a5 bd，故意拆成 e5 | a5 bd 两次写，中间隔一会儿
      const script =
        "process.stdout.write(Buffer.from([0xe5]));" +
        "setTimeout(() => process.stdout.write(Buffer.from([0xa5, 0xbd])), 150);";
      const result = await execCommand(process.execPath, ["-e", script], {
        killTree,
      });
      expect(result.stdout).toBe("好");
    });
  },
);
