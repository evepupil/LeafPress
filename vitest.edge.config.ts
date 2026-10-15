import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 真起本机 Edge 的测试（*.edge.test.ts）单独跑：一个文件跑完再跑下一个，单个测试给足时间。
 * 不从 vitest.config.ts 合并：合并时 include 会叠加，变成把全部测试再跑一遍。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@leafpress/core": fileURLToPath(
        new URL("./packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.edge.test.ts"],
    environment: "node",
    env: { TZ: "Asia/Shanghai" },
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
