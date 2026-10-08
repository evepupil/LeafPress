import { describe, expect, it } from "vitest";

import { PLATFORMS, PLATFORM_ORDER } from "@leafpress/core";

describe("@leafpress/core workspace resolution", () => {
  it("resolves shared platform catalog through the root test alias", () => {
    expect(PLATFORMS.blog.id).toBe("blog");
    expect(PLATFORM_ORDER).toContain("blog");
  });
});
