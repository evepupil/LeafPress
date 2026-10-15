/**
 * 小红书图文卡片工作流的代码步骤：排版卡片（render）、归档链接（archive）。
 *
 * 排版要出图，出图器（本机 Edge 截图）由调用方注入：登记表接真实现，
 * 测试里换成假的，不起浏览器、不真截图。归档只用 ctx 里带的网络请求。
 */
import type { CardRenderer } from "../cards/types.js";
import type { CodeStepHandler } from "../../types.js";
import { archiveXhsLink } from "./archive.js";
import { createRenderStep } from "./render.js";

export interface XhsHandlerOptions {
  /** 卡片出图器：把整组卡片截成 PNG */
  renderer: CardRenderer;
}

/** 小红书代码步骤，键是「工作流编号/步骤编号」 */
export function createXhsHandlers(
  options: XhsHandlerOptions,
): Record<string, CodeStepHandler> {
  return {
    "xhs-cards/render": createRenderStep(options.renderer),
    "xhs-cards/archive": archiveXhsLink,
  };
}
