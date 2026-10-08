import type { UseCases } from "@leafpress/core";
import type { Hono } from "hono";

export function registerSystemRoutes(app: Hono, usecases: UseCases): void {
  app.get("/api/version", (context) => context.json(usecases.version()));
  app.get("/api/bootstrap", (context) => context.json(usecases.bootstrap()));
  app.get("/api/dataset", (context) => context.json(usecases.dataset()));
  app.post("/api/export", (context) => {
    const result = usecases.exportBackup();
    return context.json({ ok: true, version: usecases.version(), ...result });
  });
}
