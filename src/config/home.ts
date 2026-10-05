/**
 * 数据目录（home）解析。
 *
 * 优先级：显式传入 > 环境变量 LEAFPRESS_HOME > <用户目录>/.leafpress。
 * 一律返回绝对路径；取不到的来源当没设置，跳过看下一个。
 * options 可省略：生产代码不传时用真实的 process.env.LEAFPRESS_HOME 和 os.homedir()；
 * 测试一律注入 env/homedir，不碰真实环境。
 */
import { homedir as osHomedir } from "node:os";
import { join, resolve } from "node:path";

import { LeafPressError } from "../shared/errors.js";

/** resolveHome 的可选来源；缺省的字段回落到真实环境 */
export interface ResolveHomeOptions {
  /** 显式指定的目录 */
  homeDir?: string | undefined;
  /** 环境变量（注入用）；缺省时读真实的 process.env */
  env?: Record<string, string | undefined> | undefined;
  /** 用户目录（注入用）；缺省时用真实的 os.homedir() */
  homedir?: string | undefined;
}

/** 判断一个来源是否「设置了」：非空字符串才算 */
function isSet(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export function resolveHome(options: ResolveHomeOptions = {}): string {
  const explicit = options.homeDir;
  if (isSet(explicit)) {
    return resolve(explicit);
  }

  const env = options.env ?? process.env;
  const fromEnv = env["LEAFPRESS_HOME"];
  if (isSet(fromEnv)) {
    return resolve(fromEnv);
  }

  const userHome = options.homedir ?? osHomedir();
  if (isSet(userHome)) {
    return resolve(join(userHome, ".leafpress"));
  }

  throw new LeafPressError(
    "USAGE",
    "无法确定 LeafPress 数据目录：没有传入目录，环境变量 LEAFPRESS_HOME 也没有设置，用户目录不可用。",
    {
      hint: "用 leafpress init 显式指定数据目录，或设置环境变量 LEAFPRESS_HOME。",
    },
  );
}

/** home 目录下的各个用途路径 */
export interface HomePaths {
  /** 数据目录本身 */
  home: string;
  /** 配置文件：<home>/config.json */
  configFile: string;
  /** 记录库文件：<home>/leafpress.db */
  dbFile: string;
  /** 运行目录：<home>/runs */
  runsDir: string;
}

export function homePaths(home: string): HomePaths {
  const base = resolve(home);
  return {
    home: base,
    configFile: join(base, "config.json"),
    dbFile: join(base, "leafpress.db"),
    runsDir: join(base, "runs"),
  };
}
