import type { ExportResult } from "@leafpress/core"

import { mutate } from "./shared"

export function exportBackup(): Promise<ExportResult> {
  return mutate("POST", "/api/export")
}
