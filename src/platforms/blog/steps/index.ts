import type { CodeStepHandler } from "../../types.js";
import {
  createBlogArchiveHandler,
  type BlogArchiveDependencies,
} from "./archive.js";
import { gateBlogDraft } from "./gate.js";
import { publishBlogDraft } from "./publish.js";

/** 博客步骤要注入的外部依赖：测试里换成假的，不真访问网络、不真等待 */
export type BlogHandlerDependencies = BlogArchiveDependencies;

/** 博客写稿工作流的三个代码步骤，键是「工作流编号/步骤编号」 */
export function createBlogHandlers(
  dependencies: BlogHandlerDependencies = {},
): Record<string, CodeStepHandler> {
  return {
    "blog-write/gate": gateBlogDraft,
    "blog-write/publish": publishBlogDraft,
    "blog-write/archive": createBlogArchiveHandler(dependencies),
  };
}
