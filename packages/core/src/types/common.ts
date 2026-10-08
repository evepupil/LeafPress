/** 本地日历日 YYYY-MM-DD（按电脑所在时区） */
export type DayKey = string

/** 带本地时区偏移的时间，例如 2026-10-08T09:30:00+08:00。记录库、接口、文件里的时间都用这个格式 */
export type IsoTime = string

/** 标签色：只落在小色点、平台标识这类小面积上 */
export type LabelColor = "red" | "orange" | "amber" | "green" | "teal" | "blue" | "indigo" | "violet" | "pink" | "gray"
