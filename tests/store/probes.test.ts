import { describe, expect, it } from "vitest";

import { withStore } from "./helpers.js";

describe("灵感探测 Repo", () => {
  it("读取上次探测时间并覆盖更新", async () => {
    await withStore((store) => {
      expect(store.probes.get("blog:b-3")).toBeUndefined();
      store.probes.set("blog:b-3", "2026-10-01T07:30:00+08:00");
      expect(store.probes.get("blog:b-3")).toBe("2026-10-01T07:30:00+08:00");

      store.probes.set("blog:b-3", "2026-10-19T07:30:00+08:00");
      expect(store.probes.get("blog:b-3")).toBe("2026-10-19T07:30:00+08:00");
      expect(store.meta.version()).toEqual({ seq: 2, snapshotSeq: 0 });
    });
  });
});
