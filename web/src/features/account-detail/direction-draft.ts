import type { Account, DayKey } from "@/data/types"

/**
 * 方向档案的编辑逻辑（纯函数，不碰界面）。
 * 看的时候显示 DirectionDoc；点「编辑」时把它连成一段段文字放进输入框（DirectionDraft）；
 * 点「保存」时把文字拆回列表，并在调整记录最前面补一条。
 */

/** 方向调整记录里的一条 */
export interface DirectionLogItem {
  date: DayKey
  note: string
}

/** 方向档案当前生效的内容 */
export interface DirectionDoc {
  positioning: string
  audience: string[]
  styleRules: string[]
  bannedPhrases: string[]
  log: DirectionLogItem[]
}

/** 编辑时输入框里的文字：几项列表各自连成一段 */
export interface DirectionDraft {
  positioning: string
  audience: string
  styleRules: string
  bannedPhrases: string
}

/** 保存时写进调整记录的那一句 */
export const SAVE_LOG_NOTE = "修改了方向档案"

/** 取账号数据里的方向档案；数组复制一份，编辑不会碰到原始数据 */
export function docOf(account: Account): DirectionDoc {
  return {
    positioning: account.positioning,
    audience: [...account.audience],
    styleRules: [...account.styleRules],
    bannedPhrases: [...account.bannedPhrases],
    log: account.directionLog.map((item) => ({ ...item })),
  }
}

/** 进入编辑：写给谁、禁用句式用「、」连起来，文风规矩一行一条 */
export function draftOf(doc: DirectionDoc): DirectionDraft {
  return {
    positioning: doc.positioning,
    audience: doc.audience.join("、"),
    styleRules: doc.styleRules.join("\n"),
    bannedPhrases: doc.bannedPhrases.join("、"),
  }
}

/** 一行里的多项按「、」「,」「，」拆开，去掉首尾空白和空项 */
export function splitList(text: string): string[] {
  return text
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** 一行一条，去掉首尾空白和空行 */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** 保存：文字拆回列表，调整记录最前面插入一条（新的在前） */
export function applyDraft(doc: DirectionDoc, draft: DirectionDraft, today: DayKey): DirectionDoc {
  return {
    positioning: draft.positioning.trim(),
    audience: splitList(draft.audience),
    styleRules: splitLines(draft.styleRules),
    bannedPhrases: splitList(draft.bannedPhrases),
    log: [{ date: today, note: SAVE_LOG_NOTE }, ...doc.log],
  }
}
