import { LeafPressError } from "../shared/errors.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new LeafPressError("INTERNAL", "编号格式不安全，无法访问数据目录。");
  }
}
