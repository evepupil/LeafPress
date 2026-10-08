import type { UseCases } from "@leafpress/core";
import type { Hono } from "hono";

import { isResponse, parseJson, requireJson } from "../http.js";
import { PullSchema, SaveNoteSchema } from "../schemas.js";

export function registerDataRoutes(app: Hono, usecases: UseCases): void {
  app.post("/api/data/pull", async (context) => {
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, PullSchema);
    if (isResponse(input)) return input;
    const result = await usecases.pullData(input);
    return context.json({ ok: true, version: usecases.version(), ...result });
  });

  app.put("/api/notes/:week", async (context) => {
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, SaveNoteSchema);
    if (isResponse(input)) return input;
    usecases.saveNote(context.req.param("week"), input);
    return context.json({ ok: true, version: usecases.version() });
  });
}
