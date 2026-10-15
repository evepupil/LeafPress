/**
 * 归档链接（archive）：从当前反馈或最近一条历史反馈里找小红书笔记链接，规范化后归档。
 *
 * - 长链：`xiaohongshu.com/explore/<编号>`、`/discovery/item/<编号>`，有没有 `www` 都认。
 *   编号是 24 位十六进制，后面必须是结尾、`/`、`?`、`#`、空白或全角标点（分享文字里
 *   链接后面常跟全角逗号）；跟别的字符就是编号被截断，不能算。
 * - 短链：`xhslink.com/...`，`ctx.fetch(短链, { redirect: "manual" })` 跳转一次，
 *   从 `location` 响应头里取编号；取不到就 ask 作者在浏览器里打开贴地址栏链接。
 * - 分享整段文字贴进来时从里面取链接。
 * - 结果的 url 一律规范成 `https://www.xiaohongshu.com/explore/<编号>`，
 *   sourceRef 是 `xiaohongshu/note/<编号>`，`xsec_token` 等参数不存。
 */
import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext } from "../../types.js";

/**
 * 长链：
 * - 主机名限定 `xiaohongshu.com` / `www.xiaohongshu.com`：前面不能是字母数字或点，
 *   `https://notxiaohongshu.com/…`、`a.xiaohongshu.com/…` 这种别的域名不能从中间认出来；
 * - 编号后面必须是结尾、`/`、`?`、`#`、空白或全角标点（，。！，分享文字里链接后
 *   常跟全角逗号）：跟别的字符（如 `_draft`、`abc`）就是编号被截断，对不上原稿。
 * 每次新建正则而不是复用带 g 标志的实例：g 的 exec 会记住 lastIndex，
 * 上一次匹配的位置会漏进下一次调用（归档是多次调用的）。
 */
const ID = "[0-9a-f]{24}";
const LONG_LINK_PATTERN =
  "(?<![0-9A-Za-z.])(?:https?:\\/\\/)?(?:www\\.)?xiaohongshu\\.com\\/" +
  `(?:explore\\/|discovery\\/item\\/)(${ID})(?=$|[\\/?#\\s]|[，。！])`;
function findLongLink(text: string): RegExpExecArray | null {
  return new RegExp(LONG_LINK_PATTERN, "i").exec(text);
}
/** 短链：后面的路径段照常见写法取，后面照长链的边界判，粘贴多带个逗号也不影响 */
const SHORT_LINK_RE = new RegExp(
  `(?:https?:\\/\\/)?(?:www\\.)?xhslink\\.com\\/[A-Za-z0-9_\\-]+(?:\\/[A-Za-z0-9_\\-]+)*(?![0-9A-Za-z_\\-])`,
  "i",
);

const ASK_NO_LINK =
  "没找到小红书笔记链接（形如 https://www.xiaohongshu.com/explore/…）。发完把分享链接（整段分享文字也行）贴在下面；还没发就先去发。";
const ASK_SHORT_LINK =
  "短链没认出来，在浏览器里打开笔记，把地址栏的链接贴在下面。";

/** 从跳转地址里取编号：只认长链的两种路径 */
function noteIdOf(url: string): string | undefined {
  return findLongLink(url)?.[1];
}

/** 归档小红书链接 */
export async function archiveXhsLink(
  ctx: CodeStepContext,
): Promise<CodeOutcome> {
  const feedback =
    ctx.work.feedback ?? ctx.work.feedbackHistory.at(-1)?.text ?? "";

  const done = (noteId: string): CodeOutcome => ({
    kind: "done",
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
    publishedAt: ctx.today,
    sourceRef: `xiaohongshu/note/${noteId}`,
  });

  // 先看长链：贴的分享文字里往往直接就是完整地址
  const long = findLongLink(feedback);
  if (long?.[1]) return done(long[1]);

  // 再看短链：跳转一次换编号。短链正则不带 g，可以直接复用
  const short = SHORT_LINK_RE.exec(feedback);
  if (short) {
    const url = short[0].startsWith("http") ? short[0] : `https://${short[0]}`;
    let location: string | null = null;
    try {
      const response = await ctx.fetch(url, { redirect: "manual" });
      location = response.headers.get("location");
    } catch {
      location = null;
    }
    const noteId = location ? noteIdOf(location) : undefined;
    if (noteId) return done(noteId);
    return { kind: "ask", ask: ASK_SHORT_LINK };
  }

  return { kind: "ask", ask: ASK_NO_LINK };
}
