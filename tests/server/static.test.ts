import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { defaultWebRoot, serveStatic } from "../../src/server/static.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir !== undefined) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function createWebRoot(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "leafpress-server-static-"));
  const root = join(tempDir, "web");
  await mkdir(join(root, "accounts"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "_next", "static"), { recursive: true });
  await writeFile(join(root, "index.html"), "root page");
  await writeFile(join(root, "accounts", "index.html"), "accounts index");
  await writeFile(join(root, "about.html"), "about html");
  await writeFile(join(root, "docs", "index.html"), "docs index");
  await writeFile(join(root, "app.js"), "export const ready = true;");
  await writeFile(
    join(root, "_next", "static", "a.js"),
    "export const asset = 1;",
  );
  await writeFile(join(root, "404.html"), "not found page");
  await writeFile(join(tempDir, "secret.txt"), "outside secret");
  return root;
}

describe("静态网页托管", () => {
  it("解析源码与 dist 布局下的默认 web/out 根目录", () => {
    const sourceModuleUrl = new URL(
      "../../src/server/static.js",
      import.meta.url,
    ).href;
    const builtModuleUrl = new URL(
      "../../dist/server/static.js",
      import.meta.url,
    ).href;
    const expected = fileURLToPath(new URL("../../web/out", sourceModuleUrl));

    expect(defaultWebRoot()).toBe(expected);
    expect(defaultWebRoot(sourceModuleUrl)).toBe(expected);
    expect(defaultWebRoot(builtModuleUrl)).toBe(expected);
  });

  it("按页面路径规则查找文件、设置 MIME 和缓存头", async () => {
    const root = await createWebRoot();
    const rootPage = await serveStatic(new Request("http://localhost/"), root);
    const accountSlash = await serveStatic(
      new Request("http://localhost/accounts/"),
      root,
    );
    const accountBare = await serveStatic(
      new Request("http://localhost/accounts"),
      root,
    );
    const extensionless = await serveStatic(
      new Request("http://localhost/about"),
      root,
    );
    const directoryFallback = await serveStatic(
      new Request("http://localhost/docs"),
      root,
    );
    const script = await serveStatic(
      new Request("http://localhost/app.js"),
      root,
    );
    const asset = await serveStatic(
      new Request("http://localhost/_next/static/a.js"),
      root,
    );

    expect(rootPage.status).toBe(200);
    expect(await rootPage.text()).toBe("root page");
    expect(await accountSlash.text()).toBe("accounts index");
    expect(await accountBare.text()).toBe("accounts index");
    expect(await extensionless.text()).toBe("about html");
    expect(await directoryFallback.text()).toBe("docs index");
    expect(script.headers.get("Content-Type")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(asset.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(script.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("缺失文件返回 404.html，目录外文件不可读", async () => {
    const root = await createWebRoot();
    const missing = await serveStatic(
      new Request("http://localhost/missing"),
      root,
    );
    const traversalPaths = [
      "/%2e%2e%2fsecret.txt",
      "/..%5csecret.txt",
      "/%252e%252e%252fsecret.txt",
      "/%00secret.txt",
    ];
    const traversals = await Promise.all(
      traversalPaths.map((path) =>
        serveStatic(new Request(`http://localhost${path}`), root),
      ),
    );

    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("not found page");
    for (const traversal of traversals) {
      expect(traversal.status).toBe(404);
      const traversalBody = await traversal.text();
      expect(traversalBody).toBe("not found page");
      expect(traversalBody).not.toContain("outside secret");
    }
  });

  it("未提供或不存在网页目录时提示尚未构建", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "leafpress-server-static-missing-"));
    const noRoot = await serveStatic(new Request("http://localhost/"));
    const missingRoot = await serveStatic(
      new Request("http://localhost/"),
      join(tempDir, "missing"),
    );

    expect(noRoot.status).toBe(200);
    expect(await noRoot.text()).toContain("网页还没构建");
    expect(await missingRoot.text()).toContain("网页还没构建");
  });
});
