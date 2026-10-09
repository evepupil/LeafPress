/**
 * Umami 共享链接：https://cloud.umami.is/analytics/us/share/<共享编号>?…
 * 拆成接口根地址（共享链接里 /share/ 前面的路径加 /api）和共享编号。
 */

export interface UmamiShareAddress {
  /** 接口根地址，例如 https://cloud.umami.is/analytics/us/api */
  apiBase: string;
  shareId: string;
}

/**
 * 格式不对返回 undefined：不是 https、带了账号口令、路径里没有 /share/<编号>。
 * /share/<编号> 后面如果还跟着网站名之类的一段（老版本 Umami 的写法），忽略它。
 */
export function parseShareUrl(value: string): UmamiShareAddress | undefined {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    return undefined;

  const marker = "/share/";
  const markerAt = url.pathname.lastIndexOf(marker);
  if (markerAt < 0) return undefined;
  const encodedId = url.pathname.slice(markerAt + marker.length).split("/")[0];
  if (encodedId === undefined || encodedId === "") return undefined;
  let shareId: string;
  try {
    shareId = decodeURIComponent(encodedId);
  } catch {
    return undefined;
  }
  if (shareId === "" || shareId.includes("/")) return undefined;

  const prefix = url.pathname.slice(0, markerAt).replace(/\/+$/, "");
  return { apiBase: `${url.origin}${prefix}/api`, shareId };
}
