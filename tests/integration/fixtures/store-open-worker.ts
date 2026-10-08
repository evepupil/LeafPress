import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { openStore } from "../../../src/store/open.js";

const [dbFile, readyFile, gateFile] = process.argv.slice(2);
if (dbFile === undefined || readyFile === undefined || gateFile === undefined) {
  throw new Error("缺少记录库并发打开 fixture 参数。");
}

writeFileSync(readyFile, String(process.pid), "utf8");
while (!existsSync(gateFile)) await delay(5);
const store = openStore(dbFile);
try {
  process.stdout.write(`${JSON.stringify(store.migration)}\n`);
} finally {
  store.close();
}
