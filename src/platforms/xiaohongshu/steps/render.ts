/**
 * 排版卡片（render）：检查两份稿子 → 清旧图出图 → 写发布稿预览页。
 *
 * 1. 读 卡片.md、文案.md，先照规格全部检查；不合格就 `{ kind: "fail" }` 把两份稿子的
 *    问题全列出来，写稿的 AI 一次改完重跑；
 * 2. 清空 {folder}/卡片/ 再出图（旧图删干净，改稿重跑不会留下上一版的尾巴）；
 * 3. 生成 小红书发布稿.html：卡片图内嵌 + 文案 + 复制按钮；
 * 4. `{ kind: "done", note: "出了 N 张卡片" }`。
 *
 * 出图器由调用方注入：真跑用本机 Edge 的实现，测试里换成假的。
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { redactSecrets } from "../../../config/redact.js";
import type { CodeOutcome } from "@leafpress/core";

import { parseCardDeck } from "../cards/parse.js";
import type { CardRenderer } from "../cards/types.js";
import type { CodeStepContext } from "../../types.js";
import { parseCopy } from "./copy.js";
import { buildPreviewPage } from "./preview.js";

const DECK_FILE = "卡片.md";
const COPY_FILE = "文案.md";
const CARD_DIR = "卡片";
const OUTPUT_FILE = "小红书发布稿.html";

/** 读一份稿子；任务文件夹里没有就是上一步没交稿，说清楚哪个文件 */
async function readDraft(
  folder: string,
  file: string,
): Promise<{ ok: true; text: string } | { ok: false; outcome: CodeOutcome }> {
  try {
    return { ok: true, text: await readFile(join(folder, file), "utf8") };
  } catch (error) {
    const missing =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT";
    return {
      ok: false,
      outcome: {
        kind: "fail",
        error: missing
          ? `任务文件夹里没有 ${file}，先让上一步把稿子写出来`
          : `${file} 读不出来：${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/** 步骤失败的统一写法：错误信息先抹密钥再写进结果（照博客步骤 config.ts 的写法） */
function stepFailure(
  ctx: Pick<CodeStepContext, "secret">,
  error: unknown,
): CodeOutcome {
  const message = error instanceof Error ? error.message : String(error);
  // 小红书账号目前没有密钥，但保持同一道抹除，以后配了也不会漏
  return { kind: "fail", error: redactSecrets(message, []) };
}

/** 建排版步骤 */
export function createRenderStep(renderer: CardRenderer) {
  return async (ctx: CodeStepContext): Promise<CodeOutcome> => {
    const deckRead = await readDraft(ctx.folder, DECK_FILE);
    if (!deckRead.ok) return deckRead.outcome;
    const copyRead = await readDraft(ctx.folder, COPY_FILE);
    if (!copyRead.ok) return copyRead.outcome;

    // 两份稿子的检查一起做完再判：不合格时一次把全部问题列出来
    const errors: string[] = [];
    const deck = parseCardDeck(deckRead.text);
    if (!deck.ok)
      errors.push(...deck.errors.map((line) => `${DECK_FILE}：${line}`));
    const copy = parseCopy(copyRead.text);
    if (!copy.ok)
      errors.push(...copy.errors.map((line) => `${COPY_FILE}：${line}`));
    if (errors.length > 0) return { kind: "fail", error: errors.join("\n") };
    // 到这里 errors 为空，两份 parse 结果一定是 ok 分支；但类型上表达不出来，
    // 用 run-time 复核代替断言（真走到这一步是代码写错了，不是稿子的问题）
    if (!deck.ok || !copy.ok)
      return { kind: "fail", error: "内部错误：检查结果不一致" };

    try {
      const outDir = join(ctx.folder, CARD_DIR);
      // 旧图清干净再出：改稿重跑时上一版的 01.png… 不能留下
      await rm(outDir, { recursive: true, force: true });
      await mkdir(outDir, { recursive: true });
      const result = await renderer.render(deck.deck, outDir, {
        // 包一层箭头函数：直接传 ctx.heartbeat 会丢掉 this（它不依赖 this，但规则和语义都更稳）
        heartbeat: () => ctx.heartbeat(),
      });

      // 内嵌的卡片图按页序排（出图器保证按页序命名，这里再排一次兜底）
      const files = [...result.files].sort((a, b) => a.localeCompare(b));
      const images = await Promise.all(
        files.map(async (file) => ({
          file,
          bytes: await readFile(join(outDir, file)),
        })),
      );
      await writeFile(
        join(ctx.folder, OUTPUT_FILE),
        buildPreviewPage({ images, copy: copy.draft }),
        "utf8",
      );
      return { kind: "done", note: `出了 ${files.length} 张卡片` };
    } catch (error) {
      return stepFailure(ctx, error);
    }
  };
}
