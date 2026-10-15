import { existsSync } from "node:fs";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export function findEdge(edgePath?: string): string {
  if (edgePath) {
    if (!existsSync(edgePath))
      throw new Error(`找不到 Edge：${edgePath} 不存在`);
    return edgePath;
  }
  const found = EDGE_PATHS.find((path) => existsSync(path));
  if (!found) throw new Error("找不到 Edge：卡片出图要用本机的 Edge 浏览器");
  return found;
}
