import { isLeafPressError } from "../shared/errors.js";

export type ErrorLogger = (message: string) => void;

function logSafely(logError: ErrorLogger | undefined, message: string): void {
  try {
    logError?.(message);
  } catch {
    // A logging failure must not replace the HTTP error being returned.
  }
}

export function toErrorResponse(
  error: unknown,
  logError?: ErrorLogger,
): Response {
  if (isLeafPressError(error)) {
    const status =
      error.code === "USAGE"
        ? 400
        : error.code === "NOT_FOUND"
          ? 404
          : error.code === "STATE_CONFLICT" ||
              error.code === "STEP_OUTPUT_INVALID"
            ? 409
            : 500;
    if (status === 500) logSafely(logError, error.message);
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.hint === undefined ? {} : { hint: error.hint }),
        },
      },
      { status },
    );
  }

  const originalMessage = error instanceof Error ? error.message : "未知错误";
  const message = `内部错误：${originalMessage}`;
  logSafely(logError, message);
  return Response.json(
    { ok: false, error: { code: "INTERNAL", message } },
    { status: 500 },
  );
}
