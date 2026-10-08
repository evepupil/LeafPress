import { readFileSync, writeFileSync } from "node:fs";
import { homePaths } from "../../src/config/home.js";
import { withTaskLock } from "../../src/files/lock.js";

const [home, counter] = process.argv.slice(2);
if (home === undefined || counter === undefined)
  throw new Error("missing worker arguments");
const paths = homePaths(home);
const waitCell = new Int32Array(new SharedArrayBuffer(4));
for (let index = 0; index < 20; index += 1) {
  withTaskLock(paths, "work-40", () => {
    const count = Number(readFileSync(counter, "utf8"));
    Atomics.wait(waitCell, 0, 0, 5);
    writeFileSync(counter, String(count + 1), "utf8");
  });
}
