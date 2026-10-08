import type { ApiError as CoreApiError } from "@leafpress/core"

/** Development points at the local service; production uses the same origin. */
export const API_BASE = process.env.NEXT_PUBLIC_LEAFPRESS_API ?? ""

export class ApiError extends Error {
  readonly code: string
  readonly hint?: string
  readonly status: number

  constructor(error: CoreApiError, status: number) {
    super(error.message)
    this.name = "ApiError"
    this.code = error.code
    this.hint = error.hint
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = isApiError(payload) ? payload.error : { code: "HTTP_ERROR", message: `请求失败（${response.status}）` }
    throw new ApiError(error, response.status)
  }
  return payload as T
}

function isApiError(value: unknown): value is { ok: false; error: CoreApiError } {
  if (typeof value !== "object" || value === null || !("error" in value)) return false
  const error = value.error
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  )
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>("GET", path)
}

export function send<T>(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, body)
}
