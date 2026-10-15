import { describe, expect, it } from "vitest";

import { archiveXhsLink } from "../../../src/platforms/xiaohongshu/steps/archive.js";
import { createXhsHandlers } from "../../../src/platforms/xiaohongshu/steps/index.js";

import { makeFakeRenderer, makeXhsFixture } from "./fixtures.js";

const ID = "65f0c8e71234abcd56ef9012";

describe("小红书 archive：长链", () => {
  it("explore 长链：url 和 sourceRef 都规范化，publishedAt 是今天", async () => {
    const fixture = await makeXhsFixture({
      feedback: `发了 https://www.xiaohongshu.com/explore/${ID} ，看看。`,
    });
    try {
      expect(await archiveXhsLink(fixture.ctx)).toEqual({
        kind: "done",
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        publishedAt: "2026-10-16",
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("不带 www 和协议的也认", async () => {
    const fixture = await makeXhsFixture({
      feedback: `xiaohongshu.com/explore/${ID}`,
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toMatchObject({
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("discovery/item 长链也认，规范化成 explore 地址", async () => {
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/discovery/item/${ID}`,
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toMatchObject({
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("带 xsec_token 查询串：参数不存", async () => {
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/explore/${ID}?xsec_token=ABcd1234&xsec_source=app_share`,
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toMatchObject({
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("编号后面跟全角逗号（分享文字里的写法）：不算链接的一部分", async () => {
    const fixture = await makeXhsFixture({
      feedback: `24 小红书【标题标题标题】 😘 😘 😘 ，快来看！\n👉 https://www.xiaohongshu.com/explore/${ID} ，复制本条信息，打开【小红书】App查看精彩内容！`,
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toMatchObject({
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("编号后面跟字母不算：编号被截断对不上原稿", async () => {
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/explore/${ID}abc 和 https://www.xiaohongshu.com/discovery/item/${ID.slice(0, 23)}`,
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome.kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("编号只有 23 位不算：不是 24 位十六进制", async () => {
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/explore/${"a".repeat(23)}`,
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("编号后面跟下划线后缀不算：编号被截断对不上原稿", async () => {
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/explore/${ID}_draft`,
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("编号后面是斜杠、问号、井号都算链接结束", async () => {
    for (const tail of ["/comment", "?x=1", "#评论"]) {
      const fixture = await makeXhsFixture({
        feedback: `https://www.xiaohongshu.com/explore/${ID}${tail}`,
      });
      try {
        expect(await archiveXhsLink(fixture.ctx)).toMatchObject({
          url: `https://www.xiaohongshu.com/explore/${ID}`,
        });
      } finally {
        await fixture.close();
      }
    }
  });

  it("当前反馈没有了才看最近一条历史反馈", async () => {
    const fixture = await makeXhsFixture({
      feedbackHistory: [`https://www.xiaohongshu.com/explore/${ID}`],
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toMatchObject({
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        sourceRef: `xiaohongshu/note/${ID}`,
      });
    } finally {
      await fixture.close();
    }
  });

  it("编号里有非十六进制字符不算", async () => {
    const bad = "g".repeat(24);
    const fixture = await makeXhsFixture({
      feedback: `https://www.xiaohongshu.com/explore/${bad}`,
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("主机名不带边界不算：notxiaohongshu.com 不是小红书", async () => {
    const fixture = await makeXhsFixture({
      feedback: `发了 https://notxiaohongshu.com/explore/${ID} ，看看。`,
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("主机名前面是别的域名的点也不算：a.xiaohongshu.com.evil.com 不是小红书", async () => {
    const fixture = await makeXhsFixture({
      feedback: `发了 https://a.xiaohongshu.com.evil.com/explore/${ID} ，看看。`,
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("行首的裸域名认得，前面是别的域名的子域名不算", async () => {
    const start = await makeXhsFixture({
      feedback: `xiaohongshu.com/explore/${ID}`,
    });
    try {
      expect((await archiveXhsLink(start.ctx)).kind).toBe("done");
    } finally {
      await start.close();
    }
    // 主机名必须正好是 xiaohongshu.com / www.xiaohongshu.com：子域名不行
    const subdomain = await makeXhsFixture({
      feedback: `https://m.xiaohongshu.com/explore/${ID}`,
    });
    try {
      expect((await archiveXhsLink(subdomain.ctx)).kind).toBe("ask");
    } finally {
      await subdomain.close();
    }
  });
});

describe("小红书 archive：短链", () => {
  it("跳转一次从 location 里取编号", async () => {
    const fixture = await makeXhsFixture({
      feedback: "发了 http://xhslink.com/a/Abc123 快来看",
    });
    try {
      fixture.setRedirects({
        "http://xhslink.com/a/Abc123": `https://www.xiaohongshu.com/discovery/item/${ID}?xsec_token=xyz`,
      });
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toEqual({
        kind: "done",
        url: `https://www.xiaohongshu.com/explore/${ID}`,
        publishedAt: "2026-10-16",
        sourceRef: `xiaohongshu/note/${ID}`,
      });
      // 用 redirect: "manual" 跳转一次，不跟到底
      expect(fixture.requests).toEqual([
        { url: "http://xhslink.com/a/Abc123", redirect: "manual" },
      ]);
    } finally {
      await fixture.close();
    }
  });

  it("location 里取不到编号：要作者去浏览器里拿地址栏链接", async () => {
    const fixture = await makeXhsFixture({
      feedback: "发了 https://xhslink.com/b/Zz9 ",
    });
    try {
      fixture.setRedirects({
        "https://xhslink.com/b/Zz9": "https://www.example.com/nowhere",
      });
      expect(await archiveXhsLink(fixture.ctx)).toEqual({
        kind: "ask",
        ask: "短链没认出来，在浏览器里打开笔记，把地址栏的链接贴在下面。",
      });
    } finally {
      await fixture.close();
    }
  });

  it("请求失败也转成要作者处理", async () => {
    const fixture = await makeXhsFixture({
      feedback: "发了 https://xhslink.com/b/boom ",
    });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome).toEqual({
        kind: "ask",
        ask: "短链没认出来，在浏览器里打开笔记，把地址栏的链接贴在下面。",
      });
    } finally {
      await fixture.close();
    }
  });
});

describe("小红书 archive：没有链接", () => {
  it("反馈里没有链接：要作者处理", async () => {
    const fixture = await makeXhsFixture({ feedback: "还没发，明天再发。" });
    try {
      const outcome = await archiveXhsLink(fixture.ctx);
      expect(outcome.kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("别的网站的链接不算小红书链接", async () => {
    const fixture = await makeXhsFixture({
      feedback: "看这个 https://example.com/explore/123",
    });
    try {
      expect((await archiveXhsLink(fixture.ctx)).kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });
});

describe("小红书步骤登记表", () => {
  it("createXhsHandlers 给出 render 和 archive 两个键", () => {
    const handlers = createXhsHandlers({
      renderer: makeFakeRenderer().renderer,
    });
    expect(Object.keys(handlers).sort()).toEqual([
      "xhs-cards/archive",
      "xhs-cards/render",
    ]);
  });
});
