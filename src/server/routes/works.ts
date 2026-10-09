import type { UseCases } from "@leafpress/core";
import type { Hono } from "hono";

import {
  decodeFileName,
  isResponse,
  invalidIdResponse,
  parseJson,
  requireJson,
  validId,
} from "../http.js";
import {
  CreateWorksSchema,
  FeedbackSchema,
  MoveWorkSchema,
  UpdateWorkSchema,
} from "../schemas.js";

export function registerWorkRoutes(app: Hono, usecases: UseCases): void {
  app.get("/api/works/:id", (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    return context.json(usecases.showWork(id));
  });

  app.post("/api/works", async (context) => {
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, CreateWorksSchema);
    if (isResponse(input)) return input;
    const works = usecases.createWorks(input);
    return context.json({ ok: true, version: usecases.version(), works });
  });

  app.patch("/api/works/:id", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, UpdateWorkSchema);
    if (isResponse(input)) return input;
    usecases.updateWork(id, input);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.post("/api/works/:id/move", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, MoveWorkSchema);
    if (isResponse(input)) return input;
    usecases.moveWork(id, input);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.post("/api/works/:id/feedback", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, FeedbackSchema);
    if (isResponse(input)) return input;
    usecases.submitFeedback(id, input.text);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.delete("/api/works/:id", (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    usecases.deleteWork(id);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.post("/api/works/:id/open-folder", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const path = await usecases.openWorkFolder(id);
    return context.json({ ok: true, path });
  });

  app.get("/api/works/:id/files/:name", (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const raw = context.req.raw.url;
    const name = decodeFileName(raw);
    if (name === undefined) return invalidIdResponse();
    const file = usecases.readWorkFile(id, name);
    return new Response(file.body, {
      headers: { "Content-Type": file.contentType },
    });
  });
}
