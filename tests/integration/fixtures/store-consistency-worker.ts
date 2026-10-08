import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { openStore } from "../../../src/store/open.js";

const [dbFile, workId, readyFile, gateFile, mode, workerId, stopFile] =
  process.argv.slice(2);
if (
  dbFile === undefined ||
  workId === undefined ||
  readyFile === undefined ||
  gateFile === undefined ||
  mode === undefined ||
  workerId === undefined ||
  stopFile === undefined
) {
  throw new Error("缺少记录库一致性 fixture 参数。");
}

const store = openStore(dbFile);
writeFileSync(readyFile, String(process.pid), "utf8");
try {
  while (!existsSync(gateFile)) await delay(5);
  if (mode === "reader") {
    let reads = 0;
    let mismatches = 0;
    while (!existsSync(stopFile)) {
      const work = store.works.get(workId);
      reads += 1;
      if (
        work === undefined ||
        work.log.length !== work.feedbackHistory.length
      ) {
        mismatches += 1;
      }
      const listed = store.works.list().find((item) => item.id === workId);
      reads += 1;
      if (
        listed === undefined ||
        listed.log.length !== listed.feedbackHistory.length
      ) {
        mismatches += 1;
      }
      await delay(1);
    }
    process.stdout.write(`${JSON.stringify({ reads, mismatches })}\n`);
  } else {
    for (let index = 0; index < 50; index += 1) {
      store.transaction(() => {
        const work = store.works.get(workId);
        if (work === undefined) throw new Error("共享作品不存在。");
        const text = `${workerId}:${index}`;
        const at = "2026-01-01T00:00:00+08:00";
        work.log.push({ at, text });
        work.feedbackHistory.push({ at, step: index, stepName: "写入", text });
        store.works.update(work);
      });
    }
    process.stdout.write(`${JSON.stringify({ writes: 50 })}\n`);
  }
} finally {
  store.close();
}
