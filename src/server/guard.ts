import type { MiddlewareHandler } from "hono";

export interface GuardOptions {
  port: number;
  dev?: boolean;
}

function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

function devOrigins(): Set<string> {
  return new Set(["http://127.0.0.1:3211", "http://localhost:3211"]);
}

function corsHeaders(origin: string, headers?: Headers): Headers {
  const result = new Headers(headers);
  result.set("Access-Control-Allow-Origin", origin);
  result.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE");
  result.set("Access-Control-Allow-Headers", "Content-Type");
  const vary = result.get("Vary");
  if (vary === null) {
    result.set("Vary", "Origin");
  } else if (
    !vary.split(",").some((value) => value.trim().toLowerCase() === "origin")
  ) {
    result.set("Vary", `${vary}, Origin`);
  }
  return result;
}

function withCorsHeaders(response: Response, origin: string): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: corsHeaders(origin, response.headers),
  });
}

export function createLocalGuard(options: GuardOptions): MiddlewareHandler {
  const hosts = allowedHosts(options.port);
  const origins = new Set([
    `http://127.0.0.1:${options.port}`,
    `http://localhost:${options.port}`,
  ]);
  const developmentOrigins = devOrigins();

  return async (context, next) => {
    const host = context.req.header("host")?.toLowerCase();
    if (host === undefined || !hosts.has(host)) {
      return context.json(
        {
          ok: false,
          error: { code: "USAGE", message: "仅允许通过本机地址访问。" },
        },
        403,
      );
    }

    const origin = context.req.header("origin");
    const developmentOrigin =
      options.dev === true &&
      origin !== undefined &&
      developmentOrigins.has(origin);
    if (origin !== undefined && !origins.has(origin) && !developmentOrigin) {
      return context.json(
        { ok: false, error: { code: "USAGE", message: "请求来源不被允许。" } },
        403,
      );
    }

    if (
      developmentOrigin &&
      origin !== undefined &&
      context.req.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    await next();
    if (developmentOrigin && origin !== undefined) {
      context.res = withCorsHeaders(context.res, origin);
    }
  };
}
