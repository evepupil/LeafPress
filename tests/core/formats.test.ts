import { describe, expect, it } from "vitest";

import { FORMATS, FORMAT_IDS, isFormatId } from "../../src/core/formats.js";

describe("形态目录", () => {
  it("每个形态编号都有定义，且定义里的编号与键一致", () => {
    for (const id of FORMAT_IDS) {
      expect(FORMATS[id].id).toBe(id);
      expect(FORMATS[id].label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(FORMATS).sort()).toEqual([...FORMAT_IDS].sort());
  });

  it("能识别合法和不合法的形态编号", () => {
    expect(isFormatId("article")).toBe(true);
    expect(isFormatId("video-portrait")).toBe(true);
    expect(isFormatId("podcast")).toBe(false);
  });
});
