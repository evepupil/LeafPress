/**
 * 网址账号口令抹除：git 错误信息里可能带 https://用户:口令@host，
 * 进日志、进错误信息前必须先把口令抹掉，避免泄漏。
 * 单独一个文件：它不属于「分析正文」，也不属于「git 操作」，谁要谁导入。
 */

/** 把网址里的账号口令抹掉：https://用户:口令@host 改成 https://<redacted>@host */
export function redactUrlCredentials(raw: string): string {
  return raw.replace(
    /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/g,
    "$1<redacted>@",
  );
}
