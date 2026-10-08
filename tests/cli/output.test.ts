import { describe, expect, it } from "vitest";

import {
  displayWidth,
  renderTable,
  tableCell,
  truncateByWidth,
} from "../../src/cli/output.js";

describe("命令行文本输出", () => {
  it("计算中英文和全角标点的显示宽度", () => {
    expect(displayWidth("Leaf中，文! ")).toBe(12);
  });

  it("把组合符、变体选择符和零宽字符计为零列，emoji 计两列", () => {
    expect(displayWidth("✅❌⭐⚡✨❓☕⌛")).toBe(16);
    expect(displayWidth("©®™♥▶✔")).toBe(6);
    expect(displayWidth("▶\uFE0F")).toBe(2);
    expect(displayWidth("🇨🇳")).toBe(2);
    expect(displayWidth("👩‍💻")).toBe(2);
    expect(displayWidth("e\u0301")).toBe(1);
    expect(displayWidth("⚡\uFE0F")).toBe(2);
    expect(displayWidth("\u200B\u200C\u200D\u200E\u200F")).toBe(0);
    expect(displayWidth("👋🏽")).toBe(2);
  });

  it("按列宽截断并在末尾追加省略号", () => {
    const emojiTruncated = truncateByWidth("▶\uFE0Fab", 3);
    expect(emojiTruncated).toBe("▶\uFE0F…");
    expect(displayWidth(emojiTruncated)).toBeLessThanOrEqual(3);
    const value = truncateByWidth("LeafPress 命令行入口", 12);
    expect(value.endsWith("…")).toBe(true);
    expect(displayWidth(value)).toBeLessThanOrEqual(12);
  });

  it("把表格单元格压成单行并按显示宽度截断", () => {
    expect(tableCell("第一行\n第二行", 40)).toBe("第一行 第二行");
    const value = tableCell("中".repeat(25), 40);
    expect(displayWidth(value)).toBeLessThanOrEqual(40);
    expect(value.endsWith("…")).toBe(true);
  });

  it("按显示宽度对齐表格列", () => {
    expect(
      renderTable(
        ["标题", "状态"],
        [
          ["A", "完成"],
          ["中文", "进行中"],
        ],
      ),
    ).toBe("标题  状态\nA     完成\n中文  进行中");
  });
});
