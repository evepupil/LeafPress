import {
  closeSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import { homePaths } from "../../src/config/home.js";
import { withTaskLock } from "../../src/files/lock.js";

const [home, workId, counter, active] = process.argv.slice(2);
if (
  home === undefined ||
  workId === undefined ||
  counter === undefined ||
  active === undefined
)
  throw new Error("missing stale-lock worker arguments");

const paths = homePaths(home);
const waitCell = new Int32Array(new SharedArrayBuffer(4));
for (let index = 0; index < 6; index += 1) {
  withTaskLock(paths, workId, () => {
    const markerFd = openSync(active, "wx");
    try {
      const count = Number(readFileSync(counter, "utf8"));
      Atomics.wait(waitCell, 0, 0, 5);
      writeFileSync(counter, String(count + 1), "utf8");
    } finally {
      closeSync(markerFd);
      rmSync(active, { force: true });
    }
  });
}
