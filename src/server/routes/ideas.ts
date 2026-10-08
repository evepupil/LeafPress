import type { UseCases } from "@leafpress/core";
import type { Hono } from "hono";

import {
  isResponse,
  invalidIdResponse,
  parseJson,
  requireJson,
  validId,
} from "../http.js";
import { AddIdeaSchema, MoveIdeaSchema, UpdateIdeaSchema } from "../schemas.js";

export function registerIdeaRoutes(app: Hono, usecases: UseCases): void {
  app.post("/api/ideas", async (context) => {
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, AddIdeaSchema);
    if (isResponse(input)) return input;
    const [idea] = usecases.addIdeas([input]);
    if (idea === undefined) throw new Error("添加灵感后没有返回结果。");
    return context.json({ ok: true, version: usecases.version(), idea });
  });

  app.patch("/api/ideas/:id", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, UpdateIdeaSchema);
    if (isResponse(input)) return input;
    usecases.updateIdea(id, input);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.post("/api/ideas/:id/move", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, MoveIdeaSchema);
    if (isResponse(input)) return input;
    usecases.moveIdea(id, input);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.delete("/api/ideas/:id", (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    usecases.deleteIdea(id);
    return context.json({ ok: true, version: usecases.version() });
  });
}
