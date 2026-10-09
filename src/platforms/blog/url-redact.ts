/**
 * 网址账号信息抹除：git 的错误信息里可能带 https://用户:口令@host，
 * 也可能把令牌直接放在用户名的位置（https://ghp_xxx@host）。
 * 进日志、进错误信息前必须先抹掉，避免泄漏。
 * 单独一个文件：它不属于「分析正文」，也不属于「git 操作」，谁要谁导入。
 */

/**
 * 网址里 :// 和 @ 之间的内容就是账号信息。
 * 不看有没有冒号：令牌放在用户名位置时根本没有冒号，用户名和令牌从外面也分不出来，一律抹掉。
 * 账号信息里允许出现 @（口令里没转义的 @），所以取到最后一个 @ 为止；但不跨 / 、不跨空白，
 * 这样 https://host/path@x 这样的路径和邮箱地址不会被误伤。
 */
const USERINFO_IN_URL = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/\s]+@/g;

/** 把网址里的账号信息抹掉：https://用户:口令@host 和 https://令牌@host 都改成 https://***@host */
export function redactUrlCredentials(raw: string): string {
  // 绝大多数文本里根本没有网址，先快速放过
  if (!raw.includes("://")) return raw;
  return raw.replace(USERINFO_IN_URL, "$1***@");
}
