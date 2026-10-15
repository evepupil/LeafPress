/**
 * M5 小红书图文卡片端到端：临时数据目录里用真实的用例层和真实的平台登记表走一遍。
 * 排版出图真起本机 Edge（不走假的出图器），所以只在 Windows 上跑。
 *
 * 顺序：建号建作品 → 写稿排版（真起 Edge 出 6 张 1080×1440）→ 预览页 →
 * 不合格稿一次报两条 → 贴分享文字归档（长链）→ 贴短链归档（假 fetch 回 302）→ 读预览页文件。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BAD_COPY_MD,
  GOOD_COPY_MD,
  GOOD_DECK_MD,
  LONG_NOTE_ID,
  SHARE_TEXT,
  SHORT_NOTE_ID,
  TODAY,
  makeM5Fetch,
  openM5Environment,
  type M5Environment,
} from "./m5-xiaohongshu-env.js";
/** PNG 宽高在文件头：8 字节签名 + IHDR 块，宽在偏移 16、高在 20，大端 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect([...bytes.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe.skipIf(process.platform !== "win32")("M5 小红书图文卡片端到端", () => {
  let environment: M5Environment | undefined;
  /** 假的网络（xhslink 短链回 302） */
  let network: ReturnType<typeof makeM5Fetch> | undefined;

  /** 阶段间传递的编号（按创建顺序拿，不硬编码） */
  let xhsAccountId = "";
  let workId = "";

  beforeAll(async () => {
    network = makeM5Fetch();
    environment = await openM5Environment(network.fetch);
  });

  afterAll(async () => {
    if (environment) {
      await environment.close();
      environment = undefined;
    }
  });

  function mustEnv(): M5Environment {
    if (!environment) throw new Error("环境没建好");
    return environment;
  }

  /** 接手一个作品：拿第 1 步（AI 写稿）的令牌和任务文件夹 */
  function startDraftStep(id: string): { folder: string; token: string } {
    const { usecases } = mustEnv();
    const started = usecases.startWork({ id });
    const token = started.lease?.token;
    if (!token) throw new Error("写稿步骤没发令牌");
    return { folder: started.detail.folder, token };
  }

  /** 接手一个作品并代替 AI 写好两份稿子（卡片稿 + 文案稿） */
  async function writeDraft(
    id: string,
    deck: string,
    copy: string,
  ): Promise<{ folder: string; token: string }> {
    const { folder, token } = startDraftStep(id);
    await writeFile(join(folder, "卡片.md"), deck, "utf8");
    await writeFile(join(folder, "文案.md"), copy, "utf8");
    return { folder, token };
  }

  it("第 1 步 建号建作品：小红书作品配上 xhs-cards 工作流", () => {
    const { usecases } = mustEnv();
    const account = usecases.addAccount({
      platform: "xiaohongshu",
      name: "小红书号",
      intro: "",
    });
    xhsAccountId = account.id;

    const [created] = usecases.createWorks({
      source: { kind: "new", title: "端到端测试这一篇" },
      accountIds: [xhsAccountId],
      brief: "把小红书图文卡片走一遍",
    });
    if (!created) throw new Error("没建出小红书作品");
    workId = created.id;
    expect(created.workflowId).toBe("xhs-cards");
    expect(created.status).toBe("todo");
  }, 20_000);

  it("第 2 步 写稿排版：卡片/ 里 6 张 1080×1440 的 PNG，预览页内嵌 6 张图和文案，作品停在你在手机上发", async () => {
    const { usecases } = mustEnv();

    // agent 接手第 1 步（AI：写卡片稿和文案），测试代替 AI 写两份稿子
    const { folder, token } = await writeDraft(
      workId,
      GOOD_DECK_MD,
      GOOD_COPY_MD,
    );
    const stepped = usecases.stepWork(workId, token);
    expect(stepped.message).toContain("下一步：排版卡片");

    // 跑代码步骤：排版卡片，真起本机 Edge 出图
    const run = await usecases.runWork(workId, token);
    expect(run.outcome, `排版没成功：${run.message}`).toMatchObject({
      kind: "done",
      note: "出了 6 张卡片",
    });
    expect(run.message).toContain("停在等你处理");

    // 卡片/ 下正好 6 张 PNG，宽高 1080×1440（读 PNG 文件头）
    const cardDir = (await readdir(join(folder, "卡片"))).sort();
    expect(cardDir).toEqual([
      "01.png",
      "02.png",
      "03.png",
      "04.png",
      "05.png",
      "06.png",
    ]);
    for (const name of cardDir) {
      const bytes = await readFile(join(folder, "卡片", name));
      expect(pngSize(bytes), name).toEqual({ width: 1080, height: 1440 });
    }

    // 预览页：6 张 data URL 图片 + 文案（标题、正文、标签）
    const page = await readFile(join(folder, "小红书发布稿.html"), "utf8");
    expect(
      (page.match(/<img src="data:image\/png;base64,/g) ?? []).length,
    ).toBe(6);
    expect(page).toContain("端到端测试这一篇");
    expect(page).toContain("点按钮就能复制");
    expect(page).toContain("#测试 #端到端 #小红书 #卡片 #集成");

    // 停在「你在手机上发」，预览页在读得到文件名单里
    expect(run.detail.work.status).toBe("waiting");
    expect(run.message).toContain("你在手机上发");
    expect(usecases.showWork(workId).files).toContain("小红书发布稿.html");
  }, 240_000);

  it("第 3 步 不合格的稿子：标题 25 字、正文里有 https://，runWork 一次把两条都报出来", async () => {
    const { usecases } = mustEnv();
    const [created] = usecases.createWorks({
      source: { kind: "new", title: "不合格稿这一篇" },
      accountIds: [xhsAccountId],
      brief: "",
    });
    if (!created) throw new Error("没建出第二个作品");

    const { token } = await writeDraft(created.id, GOOD_DECK_MD, BAD_COPY_MD);
    usecases.stepWork(created.id, token);

    const run = await usecases.runWork(created.id, token);
    expect(run.outcome.kind).toBe("fail");
    if (run.outcome.kind !== "fail") throw new Error("前面已断言是 fail");
    // 两条问题都在：标题超字、正文里有 http 链接
    expect(run.outcome.error).toContain("标题 25 字，超过 20 字");
    expect(run.outcome.error).toContain(
      "文案里不能出现 http 链接：小红书里点不了，也可能被判违规",
    );
    // 出错后作品仍是进行中，卡在排版这一步
    expect(run.detail.work.status).toBe("doing");
    expect(run.message).toContain("出错了");

    // 收尾：交还作品（不留在进行中，不影响后面的阶段）
    usecases.releaseWork(created.id, token);
  }, 60_000);

  it("第 4 步 归档长链：反馈里贴分享文字（带 xsec_token），归档后 url 规范、sourceRef 对上", async () => {
    const { usecases } = mustEnv();
    // 第 2 步排完版的作品停在「你在手机上发」，贴一段分享文字
    const feedback = usecases.submitFeedback(workId, SHARE_TEXT);
    expect(feedback.status).toBe("todo");

    const restarted = usecases.startWork({ id: workId });
    const token = restarted.lease?.token;
    if (!token) throw new Error("归档步骤没发令牌");
    expect(restarted.message).toContain("接着做：归档链接");

    const finished = await usecases.runWork(workId, token);
    expect(finished.outcome).toMatchObject({
      kind: "done",
      url: `https://www.xiaohongshu.com/explore/${LONG_NOTE_ID}`,
      sourceRef: `xiaohongshu/note/${LONG_NOTE_ID}`,
    });
    const done = finished.detail.work;
    expect(done.status).toBe("done");
    expect(done.url).toBe(
      `https://www.xiaohongshu.com/explore/${LONG_NOTE_ID}`,
    );
    expect(done.sourceRef).toBe(`xiaohongshu/note/${LONG_NOTE_ID}`);
    expect(done.publishedAt).toBe(TODAY);
    // xsec_token 等参数没有存进 url
    expect(done.url).not.toContain("xsec_token");
  }, 60_000);

  it("第 5 步 归档短链：反馈里只贴 http://xhslink.com/…，假 fetch 回 302，归档后编号对上", async () => {
    const { usecases } = mustEnv();
    if (!network) throw new Error("环境没建好");
    const [created] = usecases.createWorks({
      source: { kind: "new", title: "短链归档这一篇" },
      accountIds: [xhsAccountId],
      brief: "",
    });
    if (!created) throw new Error("没建出第三个作品");

    // 走到「你在手机上发」：写稿 + 排版（排版又真起一次 Edge）
    const { token } = await writeDraft(created.id, GOOD_DECK_MD, GOOD_COPY_MD);
    usecases.stepWork(created.id, token);
    const rendered = await usecases.runWork(created.id, token);
    expect(rendered.outcome, `排版没成功：${rendered.message}`).toMatchObject({
      kind: "done",
    });

    // 贴短链，接手跑归档
    const feedback = usecases.submitFeedback(
      created.id,
      "发了 http://xhslink.com/a/AbCdEf",
    );
    expect(feedback.status).toBe("todo");
    const restarted = usecases.startWork({ id: created.id });
    const archiveToken = restarted.lease?.token;
    if (!archiveToken) throw new Error("归档步骤没发令牌");

    const finished = await usecases.runWork(created.id, archiveToken);
    expect(finished.outcome).toMatchObject({
      kind: "done",
      url: `https://www.xiaohongshu.com/explore/${SHORT_NOTE_ID}`,
      sourceRef: `xiaohongshu/note/${SHORT_NOTE_ID}`,
    });
    expect(finished.detail.work.status).toBe("done");
    // 短链跳转只发了一次请求，访问的是假网络
    expect(network.requests).toEqual(["http://xhslink.com/a/AbCdEf"]);
  }, 240_000);

  it("第 6 步 读预览页：readWorkFile 读 小红书发布稿.html，类型是 text/html; charset=utf-8", () => {
    const { usecases } = mustEnv();
    const file = usecases.readWorkFile(workId, "小红书发布稿.html");
    expect(file.contentType).toBe("text/html; charset=utf-8");
    expect(file.body.subarray(0, 15).toString("utf8")).toBe("<!DOCTYPE html>");
  }, 20_000);
});
