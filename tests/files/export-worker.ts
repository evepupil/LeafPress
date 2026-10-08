import { writeFileSync } from "node:fs";

import { homePaths } from "../../src/config/home.js";
import { DEFAULT_CONFIG } from "../../src/config/schema.js";
import { exportBackup } from "../../src/files/export.js";

const [home, resultFile] = process.argv.slice(2);
if (home === undefined || resultFile === undefined)
  throw new Error("missing export worker arguments");

const paths = homePaths(home);
const result = exportBackup(
  paths,
  { backupTo: (target) => writeFileSync(target, "backup", "utf8") },
  DEFAULT_CONFIG,
  new Date(2026, 9, 8, 9, 30, 0),
);
writeFileSync(resultFile, result.dir, "utf8");
