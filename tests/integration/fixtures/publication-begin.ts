import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { openStore } from "../../../src/store/open.js";

const [dbFile, variantId, readyFile, gateFile] = process.argv.slice(2);
if (
  dbFile === undefined ||
  variantId === undefined ||
  readyFile === undefined ||
  gateFile === undefined
) {
  throw new Error("expected dbFile, variantId, readyFile and gateFile");
}

const store = openStore(dbFile);
writeFileSync(readyFile, String(process.pid));
while (!existsSync(gateFile)) await delay(10);

try {
  const publication = store.publications.begin({ variantId, mode: "api" });
  process.stdout.write(`${JSON.stringify({ ok: true, id: publication.id })}\n`);
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "UNKNOWN";
  process.stdout.write(`${JSON.stringify({ ok: false, code })}\n`);
} finally {
  store.close();
}
