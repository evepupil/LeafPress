import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@leafpress/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // 真起本机 Edge 的测试很吃机器，和几百个测试并行跑会把别的测试拖到超时：单独用 vitest.edge.config.ts 顺序跑
    exclude: ["**/node_modules/**", "**/*.edge.test.ts"],
    environment: "node",
    env: { TZ: "Asia/Shanghai" },
  },
});
