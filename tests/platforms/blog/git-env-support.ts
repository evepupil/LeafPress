/**
 * 联网 git 命令会去找作者已有的 ssh 设置（环境变量、git 配置）。
 * 这些设置因机器而异，要对 ssh 命令做精确断言的测试，先用这个把本机的设置屏蔽掉，
 * 再按需要自己配，免得在装了 OpenSSH 配置或全局 core.sshCommand 的机器上结果不一样。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { vi } from "vitest";

/**
 * 屏蔽本机的 ssh 设置：清掉 GIT_SSH_COMMAND、GIT_SSH，全局 git 配置换成 dir 里的一份
 * （内容是 globalConfig，缺省是空的），不读系统级配置。用完在 afterEach 里 vi.unstubAllEnvs()。
 * 返回那份全局配置的路径。
 */
export function stubCleanSshEnv(dir: string, globalConfig = ""): string {
  const path = join(dir, "global.gitconfig");
  writeFileSync(path, globalConfig, "utf8");
  vi.stubEnv("GIT_SSH_COMMAND", undefined);
  vi.stubEnv("GIT_SSH", undefined);
  vi.stubEnv("GIT_CONFIG_GLOBAL", path);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  return path;
}
