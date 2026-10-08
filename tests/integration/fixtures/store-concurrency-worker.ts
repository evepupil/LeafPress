import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { openStore } from "../../../src/store/open.js";

const [dbFile, workId, readyFile, gateFile, workerId] = process.argv.slice(2);
if (
  dbFile === undefined ||
  workId === undefined ||
  readyFile === undefined ||
  gateFile === undefined ||
  workerId === undefined
) {
  throw new Error("缺少记录库并发 fixture 参数。");
}

const store = openStore(dbFile);
writeFileSync(readyFile, String(process.pid), "utf8");
try {
  while (!existsSync(gateFile)) await delay(5);
  const serials = Array.from({ length: 50 }, () =>
    store.meta.nextSerial("work"),
  );
  for (let index = 0; index < 50; index += 1) {
    store.transaction(() => {
      const current = store.works.get(workId);
      if (current === undefined) throw new Error("共享作品不存在。");
      current.log.push({
        at: "2026-01-01T00:00:00+08:00",
        text: `${workerId}:${index}`,
      });
      store.works.update(current);
    });
  }
  process.stdout.write(`${JSON.stringify({ serials })}\n`);
} finally {
  store.close();
}
