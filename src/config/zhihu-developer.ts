/**
 * 知乎数据开放平台密钥。
 *
 * 两个来源：环境变量 ZHIHU_DEVELOPER_ACCESS_SECRET；配置里的 zhihu.developerAccessSecret。
 * 规则和知乎发布凭证一致：check 只报状态，load 才给值；信息里绝不出现密钥值。
 * options.env 可省略：生产代码不传时读真实的 process.env；测试一律注入。
 */
import { LeafPressError } from "../shared/errors.js";
import type { CredentialSource, CredentialStatus } from "./credential-types.js";

/** 空串视为没设置 */
function envValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const DEVELOPER_SECRET_ENV = "ZHIHU_DEVELOPER_ACCESS_SECRET";
/** 生成密钥的入口，写进 missing 的 detail */
export const DEVELOPER_APPLY_URL = "https://developer.zhihu.com/";

export interface CheckZhihuDeveloperOptions {
  /** 环境变量（注入用）；缺省时读真实的 process.env */
  env?: Record<string, string | undefined> | undefined;
  /** 已加载的配置；只用到 zhihu.developerAccessSecret，可以是缺省的空配置 */
  config: { zhihu?: { developerAccessSecret?: string } };
}

/** 检查知乎数据开放平台密钥的状态，只报来源，不报值 */
export function checkZhihuDeveloper(
  options: CheckZhihuDeveloperOptions,
): CredentialStatus {
  const env = options.env ?? process.env;
  const fromEnv = envValue(env, DEVELOPER_SECRET_ENV);
  const fromConfig = options.config.zhihu?.developerAccessSecret;
  const hasEnv = fromEnv !== undefined;
  const hasConfig =
    typeof fromConfig === "string" && fromConfig.length > 0 ? true : false;

  if (hasEnv && hasConfig && fromEnv !== fromConfig) {
    return {
      name: "zhihu-developer",
      state: "conflict",
      detail: `环境变量 ${DEVELOPER_SECRET_ENV} 和配置里的 zhihu.developerAccessSecret 不一致，无法确定用哪一个。`,
    };
  }

  if (hasEnv) {
    return {
      name: "zhihu-developer",
      state: "ok",
      source: "env",
      detail: "采用环境变量里的知乎数据开放平台密钥。",
    };
  }

  if (hasConfig) {
    return {
      name: "zhihu-developer",
      state: "ok",
      source: "config",
      detail: "采用配置文件里的知乎数据开放平台密钥。",
    };
  }

  return {
    name: "zhihu-developer",
    state: "missing",
    detail: `没有找到知乎数据开放平台密钥。请到 ${DEVELOPER_APPLY_URL} 登录后在个人中心生成，再配置到环境变量 ${DEVELOPER_SECRET_ENV} 或 config.json 的 zhihu.developerAccessSecret。`,
  };
}

/**
 * 读取知乎数据开放平台密钥（环境变量优先）。
 * missing 抛 CREDENTIAL_MISSING，conflict 抛 CREDENTIAL_CONFLICT；信息不含密钥值。
 */
export function loadZhihuDeveloper(options: CheckZhihuDeveloperOptions): {
  accessSecret: string;
  source: CredentialSource;
} {
  const status = checkZhihuDeveloper(options);
  if (status.state === "ok") {
    if (status.source === "env") {
      const fromEnv = envValue(
        options.env ?? process.env,
        DEVELOPER_SECRET_ENV,
      );
      if (fromEnv !== undefined) {
        return { accessSecret: fromEnv, source: "env" };
      }
    }
    const fromConfig = options.config.zhihu?.developerAccessSecret;
    if (typeof fromConfig === "string" && fromConfig.length > 0) {
      return { accessSecret: fromConfig, source: "config" };
    }
  }

  if (status.state === "conflict") {
    throw new LeafPressError(
      "CREDENTIAL_CONFLICT",
      `知乎数据开放平台密钥冲突：${status.detail}`,
      {
        hint: `环境变量 ${DEVELOPER_SECRET_ENV} 和 config.json 里的 zhihu.developerAccessSecret 只留一个。`,
      },
    );
  }
  throw new LeafPressError(
    "CREDENTIAL_MISSING",
    `知乎数据开放平台密钥不可用：${status.detail}`,
    {
      hint: `到 ${DEVELOPER_APPLY_URL} 登录后在个人中心生成密钥。`,
    },
  );
}
