/**
 * 知乎发布凭证（和知乎官方 skill 共用）。
 *
 * 两个来源：环境变量 ZHIHU_OPENAPI_APP_KEY / ZHIHU_OPENAPI_APP_SECRET；
 * 共享文件 <用户目录>/.zhihu/openapi-credentials.json（键同环境变量名）。
 * 一个来源「完整」= 两个值都是非空字符串。
 *
 * check 只报状态和来源名，绝不返回任何凭证值；load 才把值交给调用方。
 * options.env / options.homedir 可省略：生产代码不传时用真实环境；
 * 测试一律注入，不碰真实环境。
 */
import { readFile } from "node:fs/promises";
import { homedir as osHomedir } from "node:os";
import { join } from "node:path";

import { LeafPressError } from "../shared/errors.js";
import {
  type CredentialEnv,
  type CredentialStatus,
  envValue,
} from "./credential-types.js";

/** 取 Node 文件系统错误的 error.code，不是文件系统错误时返回 undefined */
function codeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

/** 去掉开头可能存在的 UTF-8 BOM：有些编辑器保存时会加上，不剥掉会被当成坏 JSON */
function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

export const OPENAPI_KEY_ENV = "ZHIHU_OPENAPI_APP_KEY";
export const OPENAPI_SECRET_ENV = "ZHIHU_OPENAPI_APP_SECRET";
/** 知乎官方 skill 的共享凭证文件（相对用户目录） */
export const OPENAPI_FILE_RELATIVE = join(".zhihu", "openapi-credentials.json");
/** 凭证申请入口，写进 missing 的 detail */
export const OPENAPI_APPLY_URL =
  "https://www.zhihu.com/playground/zhihu-publisher";

export interface CheckZhihuOpenApiOptions {
  /** 环境变量（注入用）；缺省时读真实的 process.env */
  env?: CredentialEnv | undefined;
  /** 用户目录（注入用）；缺省时用真实的 os.homedir()，共享凭证文件在它下面 */
  homedir?: string | undefined;
}

interface OpenApiPair {
  appKey: string;
  appSecret: string;
}

/** 一对值是否「完整」：两个都是非空字符串 */
function isComplete(
  pair: Partial<OpenApiPair> | null | undefined | UnreadableFile,
): boolean {
  if (isUnreadable(pair)) {
    return false;
  }
  return (
    typeof pair?.appKey === "string" &&
    pair.appKey.length > 0 &&
    typeof pair?.appSecret === "string" &&
    pair.appSecret.length > 0
  );
}

/** 共享凭证文件「读不了」的错误码：权限、被占用、是个目录等；区别于不存在 */
const UNREADABLE = new Set(["EACCES", "EPERM", "EISDIR", "EBUSY"]);

/** 读不了的结果：只带错误码，不带任何文件内容 */
interface UnreadableFile {
  unreadable: true;
  /** Node 文件系统错误码（EACCES 等）；detail 里只报它，不报文件内容 */
  code: string;
}

function isUnreadable(
  value: Partial<OpenApiPair> | undefined | null | UnreadableFile,
): value is UnreadableFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { unreadable?: unknown }).unreadable === true
  );
}

/**
 * 读共享凭证文件，正常结果有三种：
 * - Partial<OpenApiPair>：文件读到了（可能是半套）；
 * - undefined：文件不存在（ENOENT）；
 * - UnreadableFile：读不了（没权限/被占用等，把错误码带回去给 check 报 invalid）。
 */

/**
 * 读共享凭证文件。
 * 不存在返回 undefined；读不了（EACCES/EPERM/EISDIR/EBUSY 等）返回 UnreadableFile；
 * 内容不是合法 JSON、不是对象、或字段「存在但类型不对」返回 null
 * （字段压根没写返回部分对象，由调用方区分 incomplete）。
 */
async function readSharedFile(
  homedir: string,
): Promise<Partial<OpenApiPair> | undefined | null | UnreadableFile> {
  let raw: string;
  try {
    raw = await readFile(join(homedir, OPENAPI_FILE_RELATIVE), "utf8");
  } catch (error) {
    const code = codeOf(error);
    if (code === "ENOENT") {
      return undefined;
    }
    if (code !== undefined && UNREADABLE.has(code)) {
      return { unreadable: true, code };
    }
    // 其它异常（磁盘硬件错等）不是「检查」能描述的，继续抛给上层
    throw error;
  }

  let data: unknown;
  try {
    data = JSON.parse(stripBom(raw));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const result: Partial<OpenApiPair> = {};
  let broken = false;
  const key = record[OPENAPI_KEY_ENV];
  const secret = record[OPENAPI_SECRET_ENV];
  if (key === undefined) {
    // 字段缺失：不算坏，交给 incomplete 提示缺哪一项
  } else if (typeof key === "string" && key.length > 0) {
    result.appKey = key;
  } else {
    // 字段存在但类型不对（或空串）：文件不可信
    broken = true;
  }
  if (secret === undefined) {
    // 同上
  } else if (typeof secret === "string" && secret.length > 0) {
    result.appSecret = secret;
  } else {
    broken = true;
  }
  if (broken) {
    return null;
  }
  // 两个字段都没写：内容是合法对象但没有凭证，当文件坏处理
  if (result.appKey === undefined && result.appSecret === undefined) {
    return null;
  }
  return result;
}

/** 检查知乎发布凭证的状态，只报来源，不报值 */
export async function checkZhihuOpenApi(
  options: CheckZhihuOpenApiOptions = {},
): Promise<CredentialStatus> {
  const env: CredentialEnv = options.env ?? process.env;
  const homedir = options.homedir ?? osHomedir();
  const appKey = envValue(env, OPENAPI_KEY_ENV);
  const appSecret = envValue(env, OPENAPI_SECRET_ENV);
  const envPair: Partial<OpenApiPair> = {
    ...(appKey !== undefined ? { appKey } : {}),
    ...(appSecret !== undefined ? { appSecret } : {}),
  };
  const envSetAny = appKey !== undefined || appSecret !== undefined;

  const filePair = await readSharedFile(homedir);
  const fileExists = filePair !== undefined && !isUnreadable(filePair);
  const fileBroken = filePair === null || isUnreadable(filePair);
  const unreadableCode = isUnreadable(filePair) ? filePair.code : undefined;
  const envComplete = isComplete(envPair);
  const fileComplete = isComplete(filePair);

  // 判定顺序照规格：conflict > env 完整 > 文件完整 > 文件坏 > 半套 > 都没有
  // 任一项不同都算冲突；detail 只出现 APP_KEY（知乎用户名），绝不出现 APP_SECRET
  if (envComplete && isComplete(filePair)) {
    // isComplete 已排除 null / undefined / UnreadableFile，这里只为类型收窄
    const completeFile = filePair as Partial<OpenApiPair>;
    const fileAppKey = completeFile.appKey;
    const fileAppSecret = completeFile.appSecret;
    if (fileAppKey === undefined || fileAppSecret === undefined) {
      // isComplete 已排除这种情况，这里只为类型收窄
      throw new LeafPressError("INTERNAL", "共享凭证文件状态自相矛盾。");
    }
    const keyDiffers = envPair.appKey !== fileAppKey;
    const secretDiffers = envPair.appSecret !== fileAppSecret;
    if (keyDiffers || secretDiffers) {
      return {
        name: "zhihu-openapi",
        state: "conflict",
        detail: keyDiffers
          ? `环境变量和共享凭证文件的 ${OPENAPI_KEY_ENV} 不一致` +
            `（环境变量是 ${envPair.appKey}，文件里是 ${fileAppKey}），无法确定用哪一套。`
          : `环境变量和共享凭证文件的 ${OPENAPI_KEY_ENV} 相同但 ${OPENAPI_SECRET_ENV} 不一致，无法确定用哪一套。`,
      };
    }
  }

  if (envComplete) {
    return {
      name: "zhihu-openapi",
      state: "ok",
      source: "env",
      detail: "采用环境变量里的知乎发布凭证。",
    };
  }

  if (fileComplete) {
    // 环境变量只设了一半时按文件来，但要说清楚忽略了残缺的环境变量
    const note = envSetAny ? "（环境变量只设置了一半，已忽略）" : "";
    return {
      name: "zhihu-openapi",
      state: "ok",
      source: "file",
      detail: `采用共享凭证文件里的知乎发布凭证${note}。`,
    };
  }

  if (fileBroken) {
    return {
      name: "zhihu-openapi",
      state: "invalid",
      detail:
        unreadableCode !== undefined
          ? `共享凭证文件读不了（${unreadableCode}）：${OPENAPI_FILE_RELATIVE}。环境变量也不完整，请检查文件权限或是否被占用。`
          : "共享凭证文件存在但内容不是合法 JSON 或字段不对，环境变量也不完整，无法使用。",
    };
  }

  if (envSetAny || fileExists) {
    // 两个来源都残缺时，把两边缺的项都列出来
    const missing: string[] = [];
    if (appKey === undefined) {
      missing.push(`环境变量 ${OPENAPI_KEY_ENV}`);
    }
    if (appSecret === undefined) {
      missing.push(`环境变量 ${OPENAPI_SECRET_ENV}`);
    }
    if (filePair === undefined) {
      missing.push(`共享凭证文件（${OPENAPI_FILE_RELATIVE}）`);
    } else {
      if (filePair.appKey === undefined) {
        missing.push(`共享凭证文件里的 ${OPENAPI_KEY_ENV}`);
      }
      if (filePair.appSecret === undefined) {
        missing.push(`共享凭证文件里的 ${OPENAPI_SECRET_ENV}`);
      }
    }
    return {
      name: "zhihu-openapi",
      state: "incomplete",
      detail: `凭证不完整，缺少：${missing.join("；")}。`,
    };
  }

  return {
    name: "zhihu-openapi",
    state: "missing",
    detail: `没有找到知乎发布凭证。请到 ${OPENAPI_APPLY_URL} 申请，再用环境变量或共享凭证文件配置。`,
  };
}

export interface ZhihuOpenApiCredentials {
  appKey: string;
  appSecret: string;
  source: "env" | "file";
}

/**
 * 读取知乎发布凭证。状态不是 ok 时抛错：
 * missing / incomplete / invalid 抛 CREDENTIAL_MISSING，conflict 抛 CREDENTIAL_CONFLICT。
 * 错误信息只说来源和条目名，绝不含密钥值；也不挂含原始输入的 cause。
 */
export async function loadZhihuOpenApi(
  options: CheckZhihuOpenApiOptions = {},
): Promise<ZhihuOpenApiCredentials> {
  const status = await checkZhihuOpenApi(options);
  if (status.state === "ok") {
    const env: CredentialEnv = options.env ?? process.env;
    const homedir = options.homedir ?? osHomedir();
    if (status.source === "env") {
      const appKey = envValue(env, OPENAPI_KEY_ENV);
      const appSecret = envValue(env, OPENAPI_SECRET_ENV);
      if (appKey !== undefined && appSecret !== undefined) {
        return { appKey, appSecret, source: "env" };
      }
    } else {
      const filePair = await readSharedFile(homedir);
      if (
        filePair !== null &&
        filePair !== undefined &&
        !isUnreadable(filePair) &&
        filePair.appKey !== undefined &&
        filePair.appSecret !== undefined
      ) {
        return {
          appKey: filePair.appKey,
          appSecret: filePair.appSecret,
          source: "file",
        };
      }
    }
  }

  if (status.state === "conflict") {
    throw new LeafPressError(
      "CREDENTIAL_CONFLICT",
      `知乎发布凭证冲突：${status.detail}`,
      {
        hint: "保留一套凭证，把另一套删掉：环境变量或共享凭证文件二选一。",
      },
    );
  }
  throw new LeafPressError(
    "CREDENTIAL_MISSING",
    `知乎发布凭证不可用：${status.detail}`,
    {
      hint: `到 ${OPENAPI_APPLY_URL} 申请后完整配置 ${OPENAPI_KEY_ENV} 和 ${OPENAPI_SECRET_ENV}。`,
    },
  );
}
