import type {
  Account,
  CodeOutcome,
  DayKey,
  Work,
  WorkflowDef,
  WorkflowStep,
  WorkTotals,
} from "@leafpress/core";
import type { ExecFn } from "../shared/exec.js";

/** 代码步骤拿到的东西 */
export interface CodeStepContext {
  work: Work;
  account: Account;
  workflow: WorkflowDef;
  step: WorkflowStep;
  /** 任务文件夹（绝对路径，已存在） */
  folder: string;
  /** 来源作品（作品是从别的作品转来的才有，例如博客改写成知乎时的那篇博客作品） */
  sourceWork?: Work;
  today: DayKey;
  now: Date;
  /** 这个账号的普通配置值 */
  setting(key: string): string | undefined;
  /** 这个账号的密钥；只许传给平台接口，不许写进返回值、记录、文件 */
  secret(key: string): string | undefined;
  exec: ExecFn;
  /** 网络请求（等上线这类步骤用）；测试里换成假的 */
  fetch: typeof fetch;
  /** 等待（轮询用）；测试里换成不真等的 */
  sleep(ms: number): Promise<void>;
  /** 步骤要跑很久时调，给租约续期 */
  heartbeat(): void;
}

export type CodeStepHandler = (ctx: CodeStepContext) => Promise<CodeOutcome>;

/** 拿数据工具拿到的东西 */
export interface DataPullContext {
  account: Account;
  /** 这个账号的全部作品（工具按链接或原稿编号对上作品） */
  works: Work[];
  today: DayKey;
  now: Date;
  setting(key: string): string | undefined;
  secret(key: string): string | undefined;
  exec: ExecFn;
  fetch: typeof fetch;
  /** 这个账号上次拉到的最后一天（记录库里账号每天的数的最后一天）；从没拉过时没有，工具据此决定补多少天 */
  lastSnapshotDay?: DayKey;
  /** 拉的过程中报进度（补历史时会拉很久），命令行打到标准错误 */
  progress?(message: string): void;
  /** 等待（接口限流时留间隔、重试前退避）；测试里换成不真等的。没给时工具自己用真实的等待 */
  sleep?(ms: number): Promise<void>;
}

export interface DataPullResult {
  /** 账号每天的数：粉丝；平台能直接给出账号当天的主数据和互动时也带上 */
  account: {
    day: DayKey;
    followers: number | null;
    reads?: number;
    interactions?: number;
  }[];
  /** 作品每天结束时的累计数 */
  works: { workId: string; day: DayKey; totals: WorkTotals }[];
  /** 成功时给人看的一句话，例如「入库 32 个作品」 */
  note?: string;
}

export type DataPullOutcome =
  | { ok: true; result: DataPullResult }
  /** expiredKey：平台拒绝了某个配置项（比如密钥失效），用例会把它标成过期 */
  | { ok: false; reason: string; fixHint?: string; expiredKey?: string };

export interface DataTool {
  pull(ctx: DataPullContext): Promise<DataPullOutcome>;
}

/** 导入工具拿到的东西 */
export interface ImportContext {
  account: Account;
  /** LeafPress 数据目录的绝对路径；导入工具要在里面放自己的工作目录和锁（博客：检出目录） */
  home: string;
  setting(key: string): string | undefined;
  /** 这个账号的密钥（知乎导入要用开放平台密钥）；只许传给平台接口，用例在写库和返回前会抹掉它 */
  secret(key: string): string | undefined;
  exec: ExecFn;
  /** 网络请求（知乎导入调开放平台）；测试里换成假的 */
  fetch: typeof fetch;
  today: DayKey;
  /** 等待（接口限流时留间隔、重试前退避）；测试里换成不真等的。没给时工具自己用真实的等待 */
  sleep?(ms: number): Promise<void>;
}

/** 平台上一篇已发布的作品（导入成已完成作品） */
export interface ImportCandidate {
  /** 平台原稿编号，导入时靠它去重（博客：zh/<slug>） */
  sourceRef: string;
  title: string;
  url: string;
  publishedAt: DayKey;
  /** 原稿在本机的位置 */
  localPath?: string;
  tags: string[];
}

export interface ImportListing {
  candidates: ImportCandidate[];
  /** 跳过的草稿数 */
  drafts: number;
  /** 读不了或元数据有问题的原稿 */
  issues: { path: string; message: string }[];
}

export type ImportOutcome =
  | { ok: true; listing: ImportListing }
  | { ok: false; reason: string; fixHint?: string };

export interface PostImporter {
  list(ctx: ImportContext): Promise<ImportOutcome>;
}

export interface PlatformRuntime {
  codeStep(workflowId: string, stepId: string): CodeStepHandler | undefined;
  dataTool(platform: Account["platform"]): DataTool | undefined;
  importer(platform: Account["platform"]): PostImporter | undefined;
}
