/**
 * 平台登记表：登记有哪些平台、查能力、展开发布目标。
 *
 * 原理：一个 Map 按登记顺序存平台；以后加平台只要在 createDefaultRegistry
 * 里加一行登记，发布状态总览的列会自动多出来。
 */
import type {
  PlatformAdapter,
  PlatformCapability,
  PublishTarget,
} from "./types.js";
import type { FormatId } from "../core/formats.js";
import type { PlatformId } from "../core/content.js";
import { LeafPressError } from "../shared/errors.js";
import type { ExecFn } from "../shared/exec.js";
import { createBlogAdapter } from "./blog/index.js";
import { createZhihuAdapter } from "./zhihu/index.js";

export class PlatformRegistry {
  /** 按登记顺序存；Map 保留插入顺序，list() 直接用 */
  private readonly adapters = new Map<PlatformId, PlatformAdapter>();

  /** 登记一个平台；编号重复抛 INTERNAL */
  register(adapter: PlatformAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new LeafPressError(
        "INTERNAL",
        `平台编号 ${adapter.id} 已经登记过`,
        { hint: "每个平台只能登记一次，请检查初始化代码。" },
      );
    }
    this.adapters.set(adapter.id, adapter);
  }

  has(id: PlatformId): boolean {
    return this.adapters.has(id);
  }

  /** 取平台；不存在抛 PLATFORM_UNKNOWN，message 列出已登记的平台 */
  get(id: PlatformId): PlatformAdapter {
    const adapter = this.adapters.get(id);
    if (adapter === undefined) {
      const known = [...this.adapters.keys()];
      throw new LeafPressError(
        "PLATFORM_UNKNOWN",
        `未知平台：${id}（已登记：${known.join("、") || "无"}）`,
        { hint: "请检查配置里的平台编号拼写。" },
      );
    }
    return adapter;
  }

  /** 全部平台，按登记顺序 */
  list(): readonly PlatformAdapter[] {
    return [...this.adapters.values()];
  }

  /** 查某平台某形态的能力；平台不支持该形态抛 FORMAT_UNSUPPORTED */
  capability(platform: PlatformId, format: FormatId): PlatformCapability {
    const adapter = this.get(platform);
    const cap = adapter.capabilities.find((c) => c.format === format);
    if (cap === undefined) {
      throw new LeafPressError(
        "FORMAT_UNSUPPORTED",
        `${adapter.name}（${platform}）不支持形态 ${format}`,
        {
          hint: `支持的形式：${adapter.capabilities.map((c) => c.format).join("、") || "无"}`,
        },
      );
    }
    return cap;
  }

  /**
   * 发布目标：按「平台登记顺序 → 该平台能力声明顺序」展开；可以排除指定平台
   * （发布状态总览要排除博客自己）。
   */
  publishTargets(options?: {
    excludePlatforms?: readonly PlatformId[];
  }): PublishTarget[] {
    const excluded = new Set(options?.excludePlatforms ?? []);
    const targets: PublishTarget[] = [];
    for (const adapter of this.adapters.values()) {
      if (excluded.has(adapter.id)) continue;
      for (const capability of adapter.capabilities) {
        targets.push({
          platform: adapter.id,
          platformName: adapter.name,
          format: capability.format,
          capability,
        });
      }
    }
    return targets;
  }
}

/** createDefaultRegistry 的参数 */
export interface DefaultRegistryOptions {
  blog: {
    repoPath: string;
    contentDir: string;
    remote: string;
    branch: string;
  };
  /** 执行外部命令的函数；测试可换成假实现 */
  exec?: ExecFn;
}

/** 默认登记表：依次登记博客、知乎。以后加平台在这里加一行。 */
export function createDefaultRegistry(
  options: DefaultRegistryOptions,
): PlatformRegistry {
  const registry = new PlatformRegistry();
  registry.register(
    createBlogAdapter({
      repoPath: options.blog.repoPath,
      contentDir: options.blog.contentDir,
      remote: options.blog.remote,
      branch: options.blog.branch,
      ...(options.exec === undefined ? {} : { exec: options.exec }),
    }),
  );
  registry.register(createZhihuAdapter());
  return registry;
}
