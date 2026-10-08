import { PLATFORMS } from "@leafpress/core";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (PLATFORMS.blog.id !== "blog") {
  throw new Error(
    "Root runtime did not resolve @leafpress/core from its package export",
  );
}

const webDirectory = fileURLToPath(new URL("../web/", import.meta.url));
const webProbe =
  "import { PLATFORMS } from '@leafpress/core'; if (PLATFORMS.blog.id !== 'blog') throw new Error('Unexpected @leafpress/core export')";
const result = spawnSync(
  process.execPath,
  ["--input-type=module", "--eval", webProbe],
  {
    cwd: webDirectory,
    encoding: "utf8",
  },
);

if (result.error !== undefined || result.status !== 0) {
  throw new Error(
    `Web runtime did not resolve @leafpress/core from its package export:\n${result.stderr || result.error?.message || "unknown failure"}`,
  );
}

process.stdout.write(
  "Core package runtime resolution passed (root and web).\n",
);
