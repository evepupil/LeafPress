/**
 * 统一错误类型。
 *
 * 规矩：message 和 hint 都写给人看的中文，并且绝不能包含任何密钥、令牌的值；
 * 需要说明是哪项凭证出了问题时，只说名字和来源。
 */

export type ErrorCode =
  | "USAGE"
  | "CONFIG_INVALID"
  | "BLOG_REPO_INVALID"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_INVALID"
  | "STORE_FAILED"
  | "MIGRATION_FAILED"
  | "NOT_FOUND"
  | "STATE_CONFLICT"
  | "STEP_OUTPUT_INVALID"
  | "EXTERNAL_TOOL_MISSING"
  | "INTERNAL";

export class LeafPressError extends Error {
  readonly code: ErrorCode;
  /** 给作者的一句话修复建议 */
  readonly hint: string | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { hint?: string; cause?: unknown },
  ) {
    super(
      message,
      options?.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "LeafPressError";
    this.code = code;
    this.hint = options?.hint;
  }
}

export function isLeafPressError(value: unknown): value is LeafPressError {
  return value instanceof LeafPressError;
}
