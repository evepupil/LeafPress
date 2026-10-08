import { openCredentials } from "../../src/config/credentials.js";

const [file, accountId, prefix, countText] = process.argv.slice(2);
if (
  file === undefined ||
  accountId === undefined ||
  prefix === undefined ||
  countText === undefined
) {
  throw new Error("missing worker arguments");
}

const count = Number(countText);
const store = openCredentials(file);
const waitCell = new Int32Array(new SharedArrayBuffer(4));
for (let index = 0; index < count; index += 1) {
  store.set(accountId, `${prefix}-${index}`, `value-${prefix}-${index}`);
  Atomics.wait(waitCell, 0, 0, 1);
}
