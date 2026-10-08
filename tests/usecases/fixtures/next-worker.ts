import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  openApp,
  closeApp,
  createUseCases,
} from "../../../src/usecases/index.js";

const [home, readyFile, gateFile] = process.argv.slice(2);
if (home === undefined || readyFile === undefined || gateFile === undefined) {
  throw new Error("缺少 startNext 并发子进程参数。");
}
const app = openApp({ home });
const usecases = createUseCases(app);
writeFileSync(readyFile, String(process.pid), "utf8");
try {
  while (!existsSync(gateFile)) await delay(5);
  const startedAt = Date.now();
  const result = usecases.startNext();
  const finishedAt = Date.now();
  process.stdout.write(
    `${JSON.stringify({
      id: result?.detail.work.id ?? null,
      startedAt,
      finishedAt,
    })}\n`,
  );
} finally {
  closeApp(app);
}
