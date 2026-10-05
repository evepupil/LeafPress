import { randomInt } from "node:crypto";

const RUN_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function newRunId(now: Date): string {
  const date = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
  ].join("");
  const time = [
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
  ].join("");
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += RUN_ID_ALPHABET.charAt(randomInt(RUN_ID_ALPHABET.length));
  }
  return `${date}-${time}-${suffix}`;
}
