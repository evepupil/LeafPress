import {
  bottomOrder,
  pickWorkflow,
  type Account,
  type ImportSummary,
  type IsoTime,
  type PlatformInfo,
  type UseCases,
  type Work,
  type WorkflowDef,
} from "@leafpress/core";
import type {
  ImportCandidate,
  ImportListing,
  ImportOutcome,
  PostImporter,
} from "../platforms/types.js";
import { LeafPressError } from "../shared/errors.js";
import type { AppContext } from "./context.js";
import {
  nowParts,
  redactValueWithSecrets,
  requireAccount,
  secretValues,
  syncTaskFolder,
} from "./support.js";

/** 比链接时忽略末尾的斜杠：博客文章地址以 / 结尾，手填的链接常常漏掉它 */
function urlKey(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** 导入工具抛出的异常也当作「导入失败」：LeafPressError 保留原因和修复建议，其余说明是内部错误 */
function failureOf(error: unknown): ImportOutcome {
  if (error instanceof LeafPressError) {
    return {
      ok: false,
      reason: error.message,
      ...(error.hint === undefined ? {} : { fixHint: error.hint }),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, reason: `内部错误：${message}` };
}

/**
 * 跑导入工具，列出平台上已有的内容。
 * 导入工具要准备检出目录、读很多文件，可能跑很久，所以不放在事务里。
 * 工具是外部实现，报错和返回的文字都不可信：在写进记录库、返回给调用方之前，
 * 先把这个账号的全部密钥值抹掉（开跑前取一份快照，和跑完后的合并，换过密钥也不会漏）。
 */
async function listPlatformPosts(
  app: AppContext,
  account: Account,
  importer: PostImporter,
  today: string,
): Promise<ImportListing> {
  const secretsBefore = secretValues(app, account.id);
  let outcome: ImportOutcome;
  try {
    outcome = await importer.list({
      account,
      home: app.paths.home,
      // 只给普通配置项的值，密钥不交给导入工具
      setting: (key) =>
        account.settings.find((item) => item.key === key)?.value,
      exec: app.exec,
      today,
    });
  } catch (error) {
    outcome = failureOf(error);
  }
  const safe = redactValueWithSecrets(app, account.id, outcome, secretsBefore);
  if (!safe.ok) {
    throw new LeafPressError("STATE_CONFLICT", safe.reason, {
      ...(safe.fixHint === undefined ? {} : { hint: safe.fixHint }),
    });
  }
  return safe.listing;
}

/** 平台上已发布的一篇，建成已完成的作品：走完了工作流的全部步骤，来源是「导入」 */
function importedWork(input: {
  id: string;
  candidate: ImportCandidate;
  account: Account;
  workflow: WorkflowDef;
  order: number;
  at: IsoTime;
}): Work {
  const { candidate, workflow, at } = input;
  return {
    id: input.id,
    title: candidate.title,
    accountId: input.account.id,
    status: "done",
    brief: "",
    source: { kind: "import" },
    workflowId: workflow.id,
    step: workflow.steps.length,
    feedbackHistory: [],
    order: input.order,
    createdAt: at,
    updatedAt: at,
    url: candidate.url,
    publishedAt: candidate.publishedAt,
    ...(candidate.localPath === undefined
      ? {}
      : { localPath: candidate.localPath }),
    sourceRef: candidate.sourceRef,
    tags: [...candidate.tags],
    log: [{ at, text: "从博客仓库导入" }],
  };
}

/**
 * 去重并建作品，全部在一个事务里：读已有的作品、取编号、写新作品是同一个原子操作，
 * 命令行和网页同时导入时，后到的会看到先到的结果，不会建出重复的作品；中途出错一篇都不留。
 * 去重只比这个账号自己的作品：先比原稿编号，再比文章链接；同一批里重复的也只留第一篇。
 */
function saveNewWorks(
  app: AppContext,
  account: Account,
  platform: PlatformInfo,
  listing: ImportListing,
  at: IsoTime,
): ImportSummary {
  const all = app.store.works.list();
  const mine = all.filter((work) => work.accountId === account.id);
  const refs = new Set(mine.flatMap((work) => work.sourceRef ?? []));
  const urls = new Set(mine.flatMap((work) => work.url ?? []).map(urlKey));
  const order = bottomOrder(all);
  const workflow = pickWorkflow(account.platform, { kind: "import" });

  const works: Work[] = [];
  let skipped = 0;
  for (const candidate of listing.candidates) {
    if (refs.has(candidate.sourceRef) || urls.has(urlKey(candidate.url))) {
      skipped += 1;
      continue;
    }
    const serial = app.store.meta.nextSerial("work");
    const work = importedWork({
      id: `${platform.idPrefix}-${serial}`,
      candidate,
      account,
      workflow,
      order,
      at,
    });
    app.store.works.insert(work);
    works.push(work);
    refs.add(candidate.sourceRef);
    urls.add(urlKey(candidate.url));
  }
  return {
    added: works.length,
    skipped,
    drafts: listing.drafts,
    issues: listing.issues.map((issue) => ({ ...issue })),
    works,
  };
}

export function createImportUseCases(
  app: AppContext,
): Pick<UseCases, "importPosts"> {
  return {
    async importPosts(accountId: string): Promise<ImportSummary> {
      const { at, today } = nowParts(app);
      const account = app.store.transaction(() =>
        requireAccount(app, accountId),
      );
      const platform = app.catalog[account.platform];
      if (!platform.importable)
        throw new LeafPressError("USAGE", `${platform.name}还不能导入`);
      const importer = app.platforms.importer(account.platform);
      if (!importer)
        throw new LeafPressError(
          "INTERNAL",
          `${platform.name}的导入工具没有登记`,
        );

      const listing = await listPlatformPosts(app, account, importer, today);
      const summary = app.store.transaction(() =>
        saveNewWorks(app, account, platform, listing, at),
      );

      // 记录库是事实来源：任务文件夹等提交之后一次写完，写失败只记警告，不让导入失败
      for (const work of summary.works) syncTaskFolder(app, work.id);
      return summary;
    },
  };
}
