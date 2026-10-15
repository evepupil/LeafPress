import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectToEdge, evaluate } from "./cdp.js";
import type { CdpSession } from "./cdp.js";
import { cleanupEdgeProcess, startEdgeProcess } from "./edge-process.js";
import type { EdgeProcess } from "./edge-process.js";
import { findEdge } from "./edge-locate.js";
import { renderCardHtml } from "./html.js";
import type {
  CardDeck,
  CardRenderer,
  CardRenderOptions,
  CardRenderResult,
} from "./types.js";
import { DEFAULT_THEME } from "./types.js";

interface ScreenshotResult {
  data: string;
}

/** 截一页：导航到 data URL，等卡片画完，按主题尺寸出 PNG */
async function capturePage(
  session: CdpSession,
  html: string,
  outPath: string,
  theme: { width: number; height: number },
  deadline: number,
): Promise<void> {
  await session.rpc("Page.navigate", {
    url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  });
  // 新文档会把设备仿真重置掉，每页导航完都重设一遍，否则页面会回到默认窗口大小
  await session.rpc("Emulation.setDeviceMetricsOverride", {
    width: theme.width,
    height: theme.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready =
      ((await evaluate(
        session,
        `return document.readyState === "complete" && document.querySelector(".page") !== null;`,
      )) as boolean | undefined) ?? false;
    if (ready) break;
    if (Date.now() >= deadline) throw new Error("卡片页面没有加载完");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!ready) throw new Error("卡片页面没有加载完");
  await evaluate(
    session,
    "await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));",
  );
  const shot = (await session.rpc("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: 0,
      y: 0,
      width: theme.width,
      height: theme.height,
      scale: 1,
    },
  })) as ScreenshotResult;
  writeFileSync(outPath, Buffer.from(shot.data, "base64"));
}

export interface EdgeRendererOptions {
  edgePath?: string;
  tempRoot?: string;
  timeoutMs?: number;
}

/** 本机 Edge 出图器：一次 render 只起一个 Edge，截完、超时、出错都关掉、删临时目录 */
export function createEdgeCardRenderer(
  options?: EdgeRendererOptions,
): CardRenderer {
  const edgePath = options?.edgePath;
  const timeoutMs = options?.timeoutMs ?? 60_000;

  const render = async (
    deck: CardDeck,
    outDir: string,
    renderOptions?: CardRenderOptions,
  ): Promise<CardRenderResult> => {
    const theme = renderOptions?.theme ?? DEFAULT_THEME;
    const started = Date.now();
    const deadline = started + timeoutMs;
    const edgeExe = findEdge(edgePath);
    const userDir = mkdtempSync(
      join(options?.tempRoot ?? tmpdir(), "leafpress-edge-"),
    );

    let edge: EdgeProcess | null = null;
    let session: CdpSession | null = null;
    const files: string[] = [];
    try {
      edge = startEdgeProcess(edgeExe, userDir);
      session = await connectToEdge(edge, userDir, deadline);
      await session.rpc("Page.enable");
      await session.rpc("Runtime.enable");
      await session.rpc("Emulation.setDeviceMetricsOverride", {
        width: theme.width,
        height: theme.height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: theme.width,
        screenHeight: theme.height,
      });

      for (const [index] of deck.pages.entries()) {
        if (Date.now() >= deadline)
          throw new Error(
            `出图超时（${timeoutMs / 1000} 秒）：截到第 ${index} 张`,
          );
        const name = `${String(index + 1).padStart(2, "0")}.png`;
        await capturePage(
          session,
          renderCardHtml(deck, index, theme),
          join(outDir, name),
          theme,
          deadline,
        );
        files.push(name);
        renderOptions?.heartbeat?.();
      }
    } catch (error) {
      await session?.close();
      await cleanupEdgeProcess(edge, userDir, true);
      throw error;
    }
    await session?.close();
    await cleanupEdgeProcess(edge, userDir, false);
    return { files, millis: Date.now() - started };
  };
  return { render };
}
