import { describe, expect, it } from "vitest";

import { archiveZhihuLink } from "../../../src/platforms/zhihu/steps/archive.js";

import { makeZhihuFixture } from "./fixtures.js";

describe("知乎 archive：文章链接", () => {
  it("反馈里有文章链接：规范化地址，sourceRef 用文章编号", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback: "发了 https://zhuanlan.zhihu.com/p/123456 ，看看。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/123456",
        publishedAt: "2026-10-09",
        sourceRef: "zhihu/article/123456",
      });
    } finally {
      await fixture.close();
    }
  });

  it("博客改写工作流也认文章链接", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-from-blog",
      feedback: "https://zhuanlan.zhihu.com/p/42",
    });
    try {
      const outcome = await archiveZhihuLink(fixture.ctx);
      expect(outcome).toEqual({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/42",
        publishedAt: "2026-10-09",
        sourceRef: "zhihu/article/42",
      });
    } finally {
      await fixture.close();
    }
  });

  it("当前反馈没有了才看最近一条历史反馈", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedbackHistory: ["https://zhuanlan.zhihu.com/p/7"],
    });
    try {
      const outcome = await archiveZhihuLink(fixture.ctx);
      expect(outcome).toMatchObject({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/7",
        sourceRef: "zhihu/article/7",
      });
    } finally {
      await fixture.close();
    }
  });

  it("带查询串的链接：规范化时去掉查询串和后面的东西", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback:
        "https://zhuanlan.zhihu.com/p/998877?utm_source=wechat&utm_campaign=x。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toMatchObject({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/998877",
        sourceRef: "zhihu/article/998877",
      });
    } finally {
      await fixture.close();
    }
  });

  it("编号后面不是结尾、/、?、# 的不算链接：/p/123abc 不会截成 123", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback:
        "https://zhuanlan.zhihu.com/p/123abc 和 https://zhuanlan.zhihu.com/p/456，再看。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toMatchObject({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/456",
        sourceRef: "zhihu/article/456",
      });
    } finally {
      await fixture.close();
    }
  });

  it("回答编号后面跟字母同样不算：question/1/answer/2x 不截成 2", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "https://www.zhihu.com/question/1/answer/2x 失败了。",
    });
    try {
      const outcome = await archiveZhihuLink(fixture.ctx);
      expect(outcome.kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });
});

describe("知乎 archive：回答链接", () => {
  it("回答工作流认回答链接，sourceRef 用回答编号", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "回答好了：www.zhihu.com/question/111/answer/222",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "done",
        url: "https://www.zhihu.com/question/111/answer/222",
        publishedAt: "2026-10-09",
        sourceRef: "zhihu/answer/222",
      });
    } finally {
      await fixture.close();
    }
  });

  it("带协议和查询串的回答链接也规范化", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "https://www.zhihu.com/question/333/answer/444?ref=share",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toMatchObject({
        kind: "done",
        url: "https://www.zhihu.com/question/333/answer/444",
        sourceRef: "zhihu/answer/444",
      });
    } finally {
      await fixture.close();
    }
  });

  it("短格式回答链接 zhihu.com/answer/<编号>：url 和 sourceRef 都规范化", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "发了 www.zhihu.com/answer/987654321，看看。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "done",
        url: "https://www.zhihu.com/answer/987654321",
        publishedAt: "2026-10-09",
        sourceRef: "zhihu/answer/987654321",
      });
    } finally {
      await fixture.close();
    }
  });

  it("带协议和查询串的短格式回答链接也规范化", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "https://www.zhihu.com/answer/555?ref=share",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toMatchObject({
        kind: "done",
        url: "https://www.zhihu.com/answer/555",
        sourceRef: "zhihu/answer/555",
      });
    } finally {
      await fixture.close();
    }
  });
});

describe("知乎 archive：类型不对和没有链接", () => {
  it("文章工作流收到回答链接：类型不对，要作者处理", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback: "https://www.zhihu.com/question/111/answer/222",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "ask",
        ask: "没找到知乎文章链接（形如 https://zhuanlan.zhihu.com/p/…）。发完把链接填在下面；还没发就先去发。",
      });
    } finally {
      await fixture.close();
    }
  });

  it("回答工作流收到文章链接：类型不对，提示换成回答链接的说法", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback: "https://zhuanlan.zhihu.com/p/123456",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "ask",
        ask: "没找到知乎回答链接（形如 https://www.zhihu.com/question/…/answer/…）。发完把链接填在下面；还没发就先去发。",
      });
    } finally {
      await fixture.close();
    }
  });

  it("反馈里没有链接：要作者处理", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback: "还没发，明天再发。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "ask",
        ask: "没找到知乎文章链接（形如 https://zhuanlan.zhihu.com/p/…）。发完把链接填在下面；还没发就先去发。",
      });
    } finally {
      await fixture.close();
    }
  });

  it("反馈里是别的网站的链接：不算知乎链接", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback: "先看这个 https://example.com/p/123456",
    });
    try {
      const outcome = await archiveZhihuLink(fixture.ctx);
      expect(outcome.kind).toBe("ask");
    } finally {
      await fixture.close();
    }
  });

  it("按工作流要的类型找：回答工作流跳过前面类型不对的文章链接，取后面的回答链接", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-answer",
      feedback:
        "先发了一篇 https://zhuanlan.zhihu.com/p/123456 ，回答在 www.zhihu.com/question/111/answer/222 。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toEqual({
        kind: "done",
        url: "https://www.zhihu.com/question/111/answer/222",
        publishedAt: "2026-10-09",
        sourceRef: "zhihu/answer/222",
      });
    } finally {
      await fixture.close();
    }
  });

  it("文章工作流同样跳过前面的回答链接，取后面的文章链接", async () => {
    const fixture = await makeZhihuFixture({
      workflowId: "zhihu-article",
      feedback:
        "之前那个 www.zhihu.com/question/1/answer/2 是回答，文章是 https://zhuanlan.zhihu.com/p/888 。",
    });
    try {
      expect(await archiveZhihuLink(fixture.ctx)).toMatchObject({
        kind: "done",
        url: "https://zhuanlan.zhihu.com/p/888",
        sourceRef: "zhihu/article/888",
      });
    } finally {
      await fixture.close();
    }
  });
});
