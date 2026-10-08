import { extractUrl } from "@leafpress/core";
import type { CodeOutcome } from "@leafpress/core";

import type { CodeStepContext } from "../types.js";

/** 从当前反馈或最近一条历史反馈中归档发布链接。 */
export function archiveLink(ctx: CodeStepContext): Promise<CodeOutcome> {
  const feedback =
    ctx.work.feedback ?? ctx.work.feedbackHistory.at(-1)?.text ?? "";
  const url = extractUrl(feedback);
  if (url)
    return Promise.resolve({ kind: "done", url, publishedAt: ctx.today });

  return Promise.resolve({
    kind: "ask",
    ask: "没在你的反馈里找到链接。把发布后的链接填在下面；还没发就先去发。",
  });
}
