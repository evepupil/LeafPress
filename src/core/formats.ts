/**
 * 形态目录：内容在平台上的样子。
 *
 * 形态是全局统一的一张表，平台接入只声明「我支持哪几种形态、各有什么限制」。
 * 以后要支持新的内容样子（比如直播切片），在这里加一项，再给需要的平台接入声明即可。
 */

export const FORMAT_IDS = [
  "article",
  "answer",
  "post",
  "carousel",
  "video-landscape",
  "video-portrait",
] as const;

export type FormatId = (typeof FORMAT_IDS)[number];

/** 形态的主要媒介，决定需要哪类资产处理（文字排版、出图、视频转码）。 */
export type FormatMedium = "text" | "image" | "video";

export interface FormatDefinition {
  readonly id: FormatId;
  /** 中文名，给人看 */
  readonly label: string;
  readonly medium: FormatMedium;
  readonly description: string;
}

export const FORMATS: Readonly<Record<FormatId, FormatDefinition>> = {
  article: {
    id: "article",
    label: "长文",
    medium: "text",
    description: "有标题的长文",
  },
  answer: {
    id: "answer",
    label: "回答",
    medium: "text",
    description: "挂在一个问题下的长文",
  },
  post: {
    id: "post",
    label: "短帖",
    medium: "text",
    description: "短文字，可配图",
  },
  carousel: {
    id: "carousel",
    label: "图文卡片",
    medium: "image",
    description: "多张图加一段文案",
  },
  "video-landscape": {
    id: "video-landscape",
    label: "横版视频",
    medium: "video",
    description: "16:9 视频",
  },
  "video-portrait": {
    id: "video-portrait",
    label: "竖版视频",
    medium: "video",
    description: "9:16 视频",
  },
};

export function isFormatId(value: string): value is FormatId {
  return (FORMAT_IDS as readonly string[]).includes(value);
}

/**
 * 某个平台上某种形态的限制。
 *
 * 字段全部可选：没写表示不限制或不适用。字数按字符计，一个汉字算一个。
 * 限制只描述平台规则本身；怎么检查、超了怎么提示，由自查步骤负责。
 */
export interface FormatConstraints {
  readonly titleRequired?: boolean;
  readonly titleMaxChars?: number;
  readonly bodyMinChars?: number;
  readonly bodyMaxChars?: number;
  readonly imageMinCount?: number;
  readonly imageMaxCount?: number;
  /** 允许的图片宽高比，比如 "3:4"、"1:1" */
  readonly imageAspectRatios?: readonly string[];
  readonly coverRequired?: boolean;
  readonly tagMaxCount?: number;
  readonly videoMinSeconds?: number;
  readonly videoMaxSeconds?: number;
  /** 视频宽高比，比如 "16:9" */
  readonly videoAspectRatio?: string;
  readonly supportsCodeBlocks?: boolean;
  readonly supportsMath?: boolean;
  /** 能否直接渲染流程图；不能的平台要先把流程图转成图片 */
  readonly supportsMermaid?: boolean;
  readonly supportsExternalLinks?: boolean;
  /** 回答类形态：发布前必须先关联一个问题 */
  readonly requiresQuestion?: boolean;
}
