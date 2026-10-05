/**
 * 统一错误类型。
 *
 * 规矩：message 和 hint 都写给人看的中文，并且绝不能包含任何密钥、令牌的值；
 * 需要说明是哪项凭证出了问题时，只说名字和来源。
 */

export type ErrorCode =
  | "USAGE"
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "CREDENTIAL_MISSING"
  | "CREDENTIAL_CONFLICT"
  | "BLOG_REPO_INVALID"
  | "GIT_FAILED"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_INVALID"
  | "STORE_FAILED"
  | "MIGRATION_FAILED"
  | "PLATFORM_UNKNOWN"
  | "FORMAT_UNSUPPORTED"
  | "ALREADY_PUBLISHED"
  | "PUBLISH_IN_DOUBT"
  | "WORKFLOW_UNKNOWN"
  | "RUN_NOT_FOUND"
  | "RUN_STATE_CONFLICT"
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
