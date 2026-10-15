import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

export default function buildBeforeTests(): void {
  execSync("pnpm build", {
    cwd: repoRoot,
    stdio: "inherit",
    timeout: 120_000,
  });
}
