import { closeSync, existsSync, openSync, readSync } from "node:fs";

const [file, durationText] = process.argv.slice(2);
if (file === undefined || durationText === undefined)
  throw new Error("missing reader arguments");

const durationMs = Number(durationText);
const deadline = Date.now() + durationMs;
const waitCell = new Int32Array(new SharedArrayBuffer(4));
process.stdout.write("READY\n");
while (Date.now() < deadline && !existsSync(`${file}.stop`)) {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const buffer = Buffer.alloc(4096);
    readSync(fd, buffer, 0, buffer.length, 0);
    closeSync(fd);
    fd = undefined;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") throw error;
    Atomics.wait(waitCell, 0, 0, 5);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  Atomics.wait(waitCell, 0, 0, 5);
}
