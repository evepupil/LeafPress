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
  today: DayKey;
  now: Date;
  /** 这个账号的普通配置值 */
  setting(key: string): string | undefined;
  /** 这个账号的密钥；只许传给平台接口，不许写进返回值、记录、文件 */
  secret(key: string): string | undefined;
  exec: ExecFn;
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

export interface PlatformRuntime {
  codeStep(workflowId: string, stepId: string): CodeStepHandler | undefined;
  dataTool(platform: Account["platform"]): DataTool | undefined;
}
