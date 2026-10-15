/** 发布稿的固定文件名：只有这两个名字算发布稿，按这个顺序取第一个存在的 */
export const PUBLISH_PAGE_FILES = ["知乎发布稿.html", "小红书发布稿.html"] as const

/**
 * 从任务文件夹的文件名单里挑出发布稿：只认 `知乎发布稿.html`、`小红书发布稿.html`
 * 两个固定文件名，按上面的顺序取第一个存在的。
 * 不用「以 发布稿.html 结尾」判断：本机服务按同源网页打开文件，名字撞上后缀的
 * 恶意文件（如 恶意发布稿.html）也会被当发布稿打开、里面的脚本会执行。
 */
export function pickPublishPage(files: readonly string[]): string | undefined {
  return PUBLISH_PAGE_FILES.find((name) => files.includes(name))
}
