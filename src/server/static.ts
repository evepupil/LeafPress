import { realpath, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const notBuiltPage = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>网页还没构建</title><body><h1>网页还没构建</h1></body></html>`;

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function defaultWebRoot(moduleUrl: string = import.meta.url): string {
  return fileURLToPath(new URL("../../web/out", moduleUrl));
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  );
}

function cacheControl(pathname: string): string {
  return pathname.startsWith("/_next/static/")
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function responseForFile(
  bytes: Uint8Array,
  path: string,
  status = 200,
  cache = "no-cache",
): Response {
  return new Response(bytes, {
    status,
    headers: {
      "Content-Type":
        mimeTypes[extname(path).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": cache,
    },
  });
}

function nextSegmentPath(relativePath: string): string | undefined {
  const separator = relativePath.lastIndexOf("/");
  const directory =
    separator === -1 ? "" : relativePath.slice(0, separator + 1);
  const filename = relativePath.slice(separator + 1);
  if (!filename.startsWith("__next.") || !filename.endsWith(".txt"))
    return undefined;

  const segments = filename.slice(0, -".txt".length).split(".");
  const routeSegments = segments.slice(2);
  if (
    segments.length < 3 ||
    segments[0] !== "__next" ||
    segments[1] === "" ||
    routeSegments.some((segment) => segment === "")
  ) {
    return undefined;
  }

  return `${directory}${segments[0]}.${segments[1]}/${routeSegments.join("/")}.txt`;
}

function candidatePaths(pathname: string): string[] {
  const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
  const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const trimmed = normalized.replace(/^\/+/, "");
  if (normalized === "/") return ["index.html"];
  if (normalized.endsWith("/")) return [`${trimmed}index.html`];
  if (extname(trimmed) !== "") {
    const nextPath = nextSegmentPath(trimmed);
    return nextPath === undefined ? [trimmed] : [trimmed, nextPath];
  }
  return [`${trimmed}.html`, `${trimmed}/index.html`];
}

async function readContainedFile(
  root: string,
  relativePath: string,
): Promise<{ bytes: Uint8Array; path: string } | undefined> {
  const candidate = resolve(root, relativePath);
  if (!isWithin(root, candidate)) return undefined;
  try {
    const realPath = await realpath(candidate);
    if (!isWithin(root, realPath) || !(await stat(realPath)).isFile())
      return undefined;
    return { bytes: await readFile(realPath), path: realPath };
  } catch {
    return undefined;
  }
}

export async function serveStatic(
  request: Request,
  webRoot?: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, { status: 404 });
  if (webRoot === undefined) {
    return new Response(request.method === "HEAD" ? null : notBuiltPage, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  let root: string;
  try {
    root = await realpath(webRoot);
    if (!(await stat(root)).isDirectory())
      throw new Error("webRoot is not a directory");
  } catch {
    return new Response(request.method === "HEAD" ? null : notBuiltPage, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  let paths: string[];
  try {
    paths = candidatePaths(new URL(request.url).pathname);
  } catch {
    paths = [];
  }

  for (const path of paths) {
    const file = await readContainedFile(root, path);
    if (file !== undefined) {
      const cache = cacheControl(
        new URL(request.url).pathname.replaceAll("\\", "/"),
      );
      return responseForFile(
        request.method === "HEAD" ? new Uint8Array() : file.bytes,
        file.path,
        200,
        cache,
      );
    }
  }

  if (paths[0] === "favicon.ico") return new Response(null, { status: 204 });

  const fallback = await readContainedFile(root, "404.html");
  if (fallback === undefined) return new Response("Not Found", { status: 404 });
  return responseForFile(
    request.method === "HEAD" ? new Uint8Array() : fallback.bytes,
    fallback.path,
    404,
  );
}
