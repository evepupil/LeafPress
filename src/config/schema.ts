/**
 * config.json 的 zod 定义与配置类型。
 *
 * 所有对象都用 z.strictObject：出现未知字段直接报错，防止拼错字段名后静默失效。
 * 注意：配置里可能有密钥（zhihu.developerAccessSecret），所以校验错误信息
 * 一律只写「字段路径：问题」，绝不能带字段的值。
 */
import { z } from "zod";

/** 非空字符串：去掉首尾空白后还得有内容，防止只填了空格 */
export const NonEmptyString = z.string().check((ctx) => {
  // check 回调通过向 ctx.issues 里推条目报告失败；不推就是通过
  if (ctx.value.trim().length === 0) {
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      message: "不能为空字符串",
    });
  }
});

export const BlogSchema = z.strictObject({
  /** 博客仓库在磁盘上的路径 */
  repoPath: NonEmptyString,
  /** 相对博客仓库根目录的内容目录 */
  contentDir: NonEmptyString.default("content/posts"),
  /** git 远程名 */
  remote: NonEmptyString.default("origin"),
  /** git 分支名 */
  branch: NonEmptyString.default("main"),
  /** 原稿默认取哪个语言目录 */
  primaryLocaleDir: NonEmptyString.default("zh"),
  /** 站点地址，可选；报错文案换成中文，且不带值 */
  siteUrl: z.url({ error: "不是合法的网址" }).optional(),
});

export const MaterialsSchema = z.strictObject({
  /** 素材来源：项目仓库路径列表 */
  projects: z.array(NonEmptyString).default([]),
});

export const ZhihuConfigSchema = z.strictObject({
  /** 知乎数据开放平台密钥，可选（也可以用环境变量提供） */
  developerAccessSecret: NonEmptyString.optional(),
});

export const BrowserConfigSchema = z.strictObject({
  /** 浏览器可执行文件路径，可选 */
  executablePath: NonEmptyString.optional(),
});

export const ConfigSchema = z.strictObject({
  version: z.literal(1, { error: "必须是 1" }),
  blog: BlogSchema,
  materials: MaterialsSchema.default({ projects: [] }),
  zhihu: ZhihuConfigSchema.default({}),
  browser: BrowserConfigSchema.default({}),
});

/** config.json 的完整类型（已带上默认值） */
export type LeafPressConfig = z.output<typeof ConfigSchema>;

/** blog 小节的类型 */
export type BlogConfig = z.output<typeof BlogSchema>;
