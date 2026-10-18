import type { DayKey } from "@leafpress/core";

import type { ExecFn } from "../shared/exec.js";

/**
 * 跑灵感用到的本机来源：作者自己的开发记录（见 docs/模块设计/灵感-跑灵感.md「开发记录」）。
 * 只读：跑 git log、读进度流水文件，不改任何项目里的东西。
 */

/** 一个项目这段时间的开发记录 */
export interface DevActivity {
  /** 项目文件夹名 */
  repo: string;
  /** 项目文件夹的绝对路径 */
  path: string;
  /** 提交说明（不含合并提交），新的在前，最多 30 条 */
  commits: string[];
  /**
   * 进度流水：项目里 docs/进度/<YYYY-MM-DD>.md 中日期落在这段时间的文件，新的在前，最多 10 个；
   * headings 是文件里的二级标题（「## 」开头的行，去掉井号和首尾空白）
   */
  logs: { file: string; headings: string[] }[];
}

export interface DevActivityInput {
  /** 在这些文件夹下面一层找项目（有 .git 的文件夹才算）；不存在的根跳过 */
  roots: readonly string[];
  /** 从哪天起（含这天，按北京时间） */
  since: DayKey;
  exec: ExecFn;
}

/** 这段时间有提交或有进度流水的项目，按提交条数从多到少，再按项目名 */
export type ReadDevActivity = (
  input: DevActivityInput,
) => Promise<DevActivity[]>;
