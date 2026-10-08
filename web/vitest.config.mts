import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@leafpress/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
})
