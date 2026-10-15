import { describe, expect, it } from "vitest"

import { pickPublishPage } from "./work-sheet-publish-page"

describe("挑选发布稿", () => {
  it("知乎和小红书的发布稿都认", () => {
    expect(pickPublishPage(["知乎发布稿.html"])).toBe("知乎发布稿.html")
    expect(pickPublishPage(["小红书发布稿.html"])).toBe("小红书发布稿.html")
  })
  it("文件名在名单任意位置都行，混着别的文件也行", () => {
    expect(pickPublishPage(["卡片.md", "小红书发布稿.html", "卡片/01.png"])).toBe("小红书发布稿.html")
    expect(pickPublishPage(["文案.md", "知乎发布稿.html"])).toBe("知乎发布稿.html")
  })
  it("两个发布稿都在时按固定顺序取知乎的", () => {
    expect(pickPublishPage(["小红书发布稿.html", "知乎发布稿.html"])).toBe("知乎发布稿.html")
    expect(pickPublishPage(["知乎发布稿.html", "小红书发布稿.html"])).toBe("知乎发布稿.html")
  })
  it("只认两个固定文件名：名字撞上后缀不算（本机服务按同源打开，脚本会执行）", () => {
    expect(pickPublishPage(["恶意发布稿.html"])).toBeUndefined()
    expect(pickPublishPage(["恶意发布稿.html", "卡片.md"])).toBeUndefined()
  })
  it("结尾不是发布稿的不算", () => {
    expect(pickPublishPage(["发布稿.htmlx"])).toBeUndefined()
    expect(pickPublishPage(["知乎发布稿.html.bak"])).toBeUndefined()
    expect(pickPublishPage(["知乎发布稿"])).toBeUndefined()
    expect(pickPublishPage(["发布稿.md"])).toBeUndefined()
  })
  it("没有文件或都不是发布稿时返回 undefined", () => {
    expect(pickPublishPage([])).toBeUndefined()
    expect(pickPublishPage(["卡片.md", "卡片/01.png"])).toBeUndefined()
  })
})
