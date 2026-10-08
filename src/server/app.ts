import type { UseCases } from "@leafpress/core";
import { Hono } from "hono";

import { apiFailure } from "./http.js";
import { createLocalGuard } from "./guard.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerDataRoutes } from "./routes/data.js";
import { registerIdeaRoutes } from "./routes/ideas.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerWorkRoutes } from "./routes/works.js";
import { serveStatic } from "./static.js";
import { toErrorResponse } from "./errors.js";

export interface ServerDeps {
  usecases: UseCases;
  port: number;
  webRoot?: string;
  dev?: boolean;
  logError?: (message: string) => void;
}

export function createServerApp(deps: ServerDeps): Hono {
  const app = new Hono();
  app.use("*", createLocalGuard({ port: deps.port, dev: deps.dev }));
  registerWorkRoutes(app, deps.usecases);
  registerIdeaRoutes(app, deps.usecases);
  registerAccountRoutes(app, deps.usecases);
  registerDataRoutes(app, deps.usecases);
  registerSystemRoutes(app, deps.usecases);
  app.notFound((context) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/"))
      return apiFailure(404, "NOT_FOUND", "找不到该接口。");
    return serveStatic(context.req.raw, deps.webRoot);
  });
  app.onError((error) => toErrorResponse(error, deps.logError));
  return app;
}
