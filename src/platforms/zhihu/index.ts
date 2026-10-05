/**
 * 知乎平台接入（M0 只声明能力）。
 *
 * 长文用 skill-handoff 发布，回答用 manual；没有原稿来源。
 * 转换、发布在 M1 补。
 */
import type { PlatformAdapter, PlatformCapability } from "../types.js";
import type { FormatConstraints } from "../../core/formats.js";
import type { PlatformId } from "../../core/content.js";

/** 平台编号 */
export const ZHIHU_PLATFORM_ID: PlatformId = "zhihu";

const TEXT_CONSTRAINTS: FormatConstraints = {
  supportsCodeBlocks: true,
  supportsMath: true,
  supportsMermaid: false,
  supportsExternalLinks: true,
};

const ZHIHU_CAPABILITIES: readonly PlatformCapability[] = [
  {
    // 长文：标题必填，交给知乎官方发布 skill
    format: "article",
    constraints: { ...TEXT_CONSTRAINTS, titleRequired: true },
    publishModes: ["skill-handoff"],
  },
  {
    // 回答：必须先关联一个问题，作者手动发布
    format: "answer",
    constraints: { ...TEXT_CONSTRAINTS, requiresQuestion: true },
    publishModes: ["manual"],
  },
];

/** 创建知乎平台接入：M0 只有能力声明 */
export function createZhihuAdapter(): PlatformAdapter {
  return {
    id: ZHIHU_PLATFORM_ID,
    name: "知乎",
    capabilities: ZHIHU_CAPABILITIES,
  };
}
