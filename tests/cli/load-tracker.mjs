import { registerHooks } from "node:module";
import { writeFileSync } from "node:fs";

const loaded = new Set();

function record(specifier, url) {
  const normalized = decodeURIComponent(url).replaceAll("\\", "/");
  if (specifier === "node:sqlite" || normalized === "node:sqlite") {
    loaded.add("node:sqlite");
  }
  if (
    specifier === "hono" ||
    specifier.startsWith("hono/") ||
    /\/node_modules\/(?:\.pnpm\/)?hono@?/.test(normalized)
  ) {
    loaded.add("hono");
  }
  if (
    specifier === "zod" ||
    specifier.startsWith("zod/") ||
    /\/node_modules\/(?:\.pnpm\/)?zod@?/.test(normalized)
  ) {
    loaded.add("zod");
  }
  if (/\/(?:src|dist)\/usecases\//.test(normalized)) {
    loaded.add("src/usecases");
  }
  if (/\/(?:src|dist)\/store\//.test(normalized)) {
    loaded.add("src/store");
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    record(specifier, result.url);
    return result;
  },
});

process.on("exit", () => {
  const log = process.env["LEAFPRESS_MODULE_LOG"];
  if (log !== undefined) writeFileSync(log, JSON.stringify([...loaded]));
});
