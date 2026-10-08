import { TextDecoder } from "node:util";
import type { output, ZodIssue, ZodType } from "zod";

export function apiFailure(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function issueMessage(issue: ZodIssue): string {
  const path =
    issue.path.length === 0 ? "请求体" : issue.path.map(String).join(".");
  if (issue.code === "unrecognized_keys") {
    return `${path}：不认识的字段 ${issue.keys.join(", ")}`;
  }
  return `${path}：格式不正确`;
}

export async function parseJson<S extends ZodType>(
  request: Request,
  schema: S,
): Promise<output<S> | Response> {
  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return apiFailure(400, "USAGE", "请求体不是有效的 JSON。");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return apiFailure(400, "USAGE", "请求体不是 UTF-8 编码");
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiFailure(400, "USAGE", "请求体不是有效的 JSON。");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map(issueMessage).join("；");
    return apiFailure(400, "USAGE", message);
  }
  return result.data;
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function validId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

export function invalidIdResponse(): Response {
  return apiFailure(404, "NOT_FOUND", "找不到该编号。");
}

export function requireJson(request: Request): Response | undefined {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType === "application/json") return undefined;
  return apiFailure(415, "USAGE", "请求必须使用 application/json。");
}
