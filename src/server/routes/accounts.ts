import type { UseCases } from "@leafpress/core";
import type { Hono } from "hono";

import {
  isResponse,
  invalidIdResponse,
  parseJson,
  requireJson,
  validId,
} from "../http.js";
import {
  AddAccountSchema,
  SaveProfileSchema,
  SetSettingSchema,
  UpdateAccountSchema,
} from "../schemas.js";

export function registerAccountRoutes(app: Hono, usecases: UseCases): void {
  app.post("/api/accounts", async (context) => {
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, AddAccountSchema);
    if (isResponse(input)) return input;
    const account = usecases.addAccount(input);
    return context.json({ ok: true, version: usecases.version(), account });
  });

  app.patch("/api/accounts/:id", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, UpdateAccountSchema);
    if (isResponse(input)) return input;
    usecases.updateAccount(id, input);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.put("/api/accounts/:id/profile", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, SaveProfileSchema);
    if (isResponse(input)) return input;
    usecases.saveProfile(id, input.profile);
    return context.json({ ok: true, version: usecases.version() });
  });

  app.put("/api/accounts/:id/settings/:key", async (context) => {
    const id = context.req.param("id");
    if (!validId(id)) return invalidIdResponse();
    const mediaTypeError = requireJson(context.req.raw);
    if (mediaTypeError !== undefined) return mediaTypeError;
    const input = await parseJson(context.req.raw, SetSettingSchema);
    if (isResponse(input)) return input;
    usecases.setSetting(id, context.req.param("key"), input.value);
    return context.json({ ok: true, version: usecases.version() });
  });
}
