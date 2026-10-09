import type { CodeStepHandler } from "../../types.js";
import { archiveZhihuLink } from "./archive.js";
import { generateCopyPage } from "./copy-page.js";

/** 知乎三条工作流的代码步骤，键是「工作流编号/步骤编号」；copy-page 和 archive 共用实现 */
export const ZHIHU_STEP_HANDLERS: Record<string, CodeStepHandler> = {
  "zhihu-from-blog/copy-page": generateCopyPage,
  "zhihu-from-blog/archive": archiveZhihuLink,
  "zhihu-article/copy-page": generateCopyPage,
  "zhihu-article/archive": archiveZhihuLink,
  "zhihu-answer/copy-page": generateCopyPage,
  "zhihu-answer/archive": archiveZhihuLink,
};
