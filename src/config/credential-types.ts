/**
 * 凭证判定的公共类型。
 *
 * 铁律：check 函数返回的 detail、load 函数抛出的错误信息，
 * 一律只出现来源和条目名，绝不出现任何密钥的值；也不把含原始输入的东西挂到 cause 上。
 */

export type CredentialName = "zhihu-openapi" | "zhihu-developer";

export type CredentialState =
  "ok" | "missing" | "incomplete" | "conflict" | "invalid";

/** state 为 ok 时实际采用的来源 */
export type CredentialSource = "env" | "file" | "config";

export interface CredentialStatus {
  name: CredentialName;
  state: CredentialState;
  source?: CredentialSource;
  /** 中文说明，不含任何密钥 */
  detail: string;
}

/** 环境变量的形状：注入用，值可能是 undefined */
export type CredentialEnv = Record<string, string | undefined>;

/** 取环境变量，空串视为没设置 */
export function envValue(env: CredentialEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
