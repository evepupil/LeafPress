import type { Hono } from "hono";

export const TEST_PORT = 3210;

export function appRequest(
  app: Hono,
  path: string,
  init: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  const headers = new Headers({
    Host: `127.0.0.1:${TEST_PORT}`,
    ...init.headers,
  });
  return Promise.resolve(
    app.request(
      new Request(`http://127.0.0.1:${TEST_PORT}${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(init.body === undefined ? {} : { body: init.body }),
      }),
    ),
  );
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}
