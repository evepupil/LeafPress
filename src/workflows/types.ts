/**
 * 工作流框架的接口。
 *
 * 一个工作流是一串固定步骤。步骤分五种：
 *   code    命令行自己做完
 *   ai      交给 skill（Claude Code）做：命令行写出任务文件后暂停，skill 把结果写进指定文件后恢复
 *   confirm 等作者确认
 *   handoff 交给外部发布工具（比如知乎官方 skill），结束后读它留下的结果文件
 *   manual  作者在平台上手动操作，完成后回填链接
 *
 * 除 code 以外的步骤都会让运行停下来（等待中），之后用 resume 从停下的地方接着跑。
 * 每个步骤完成时记下输入文件的哈希；恢复时只要上游某步的输入文件变了，
 * 就从那一步起往后全部作废重跑（比如作者改了稿，后面的转换、打包都要重做）。
 */
import type { IsoDateTime } from "../core/content.js";

export type StepKind = "code" | "ai" | "confirm" | "handoff" | "manual";

/** 运行状态：running 运行中，waiting 等待中，其余为结束状态 */
export type RunState =
  "running" | "waiting" | "completed" | "failed" | "cancelled";

export type StepStatus = "pending" | "running" | "done" | "waiting" | "failed";

export type WaitKind = Exclude<StepKind, "code">;

export interface WaitChoice {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

/** 步骤停下来时，告诉 skill 在等什么、相关文件在哪 */
export interface WaitRequest {
  readonly kind: WaitKind;
  /** 给 skill 和作者看的中文说明 */
  readonly message: string;
  /** 等 AI：任务文件，写明要做什么、输入在哪、结果写到哪、什么格式 */
  readonly taskFile?: string;
  /** 等 AI：结果要写到的文件 */
  readonly outputFile?: string;
  /** 等确认：给作者看的预览文件 */
  readonly previewFile?: string;
  /** 等交接：交接目录 */
  readonly handoffDir?: string;
  /** 让作者挑的选项，比如候选问题 */
  readonly choices?: readonly WaitChoice[];
}

/** 恢复运行时 skill 带回来的东西 */
export interface ResumeInput {
  /** 作者同意 */
  readonly approve?: boolean;
  /** 作者驳回的原因；有值表示不同意 */
  readonly reject?: string;
  /** 手动发布后回填的链接 */
  readonly url?: string;
  /** 作者选中的选项编号 */
  readonly choice?: string;
}

export type StepOutcome =
  | {
      readonly type: "done";
      readonly outputs?: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "wait"; readonly wait: WaitRequest }
  | { readonly type: "fail"; readonly error: string }
  /** 回到更早的某一步重跑，比如作者驳回预览后回到改写 */
  | {
      readonly type: "rewind";
      readonly toStepId: string;
      readonly reason: string;
    };

export type WorkflowParams = Readonly<Record<string, unknown>>;

export interface StepContext<P extends WorkflowParams = WorkflowParams> {
  readonly runId: string;
  /** 本次运行的目录：<LeafPress 数据目录>/runs/<runId>，引擎保证已存在 */
  readonly runDir: string;
  /** 本步骤的目录：<runDir>/<stepId>，引擎保证已存在 */
  readonly stepDir: string;
  readonly params: P;
  /** 已完成步骤的输出，按步骤编号索引 */
  readonly outputs: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /** 只有从等待中恢复这一步时才有 */
  readonly resume?: ResumeInput;
  /** 当前时间，测试时可以注入 */
  now(): Date;
}

export interface StepDefinition<P extends WorkflowParams = WorkflowParams> {
  /** 在工作流内唯一、稳定的编号，比如 "rewrite" */
  readonly id: string;
  readonly kind: StepKind;
  /** 中文名，比如「改写」 */
  readonly title: string;
  /**
   * 本步骤依赖的输入文件（绝对路径）。步骤完成时引擎记下它们的哈希；
   * 恢复时任何一个变了或消失了，就从本步骤起往后全部作废重跑。
   */
  inputFiles(ctx: StepContext<P>): readonly string[];
  run(ctx: StepContext<P>): Promise<StepOutcome>;
}

export interface WorkflowDefinition<P extends WorkflowParams = WorkflowParams> {
  readonly id: string;
  /** 中文名，比如「转写」 */
  readonly title: string;
  /** 校验并规整参数；不合法时抛 LeafPressError("USAGE") */
  parseParams(raw: unknown): P;
  readonly steps: readonly StepDefinition<P>[];
}

export interface RunRecord {
  readonly id: string;
  readonly workflowId: string;
  readonly params: WorkflowParams;
  readonly state: RunState;
  /** 当前（或下一个要跑的）步骤序号，从 0 开始 */
  readonly cursor: number;
  readonly error?: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StepRecord {
  readonly runId: string;
  readonly stepId: string;
  readonly index: number;
  readonly status: StepStatus;
  /** 完成时记下的输入文件哈希：绝对路径 → sha256（缺失为 "absent"） */
  readonly inputHashes: Readonly<Record<string, string>>;
  readonly outputs?: Readonly<Record<string, unknown>>;
  readonly wait?: WaitRequest;
  readonly error?: string;
  /** 这一步被执行过几次 */
  readonly attempts: number;
  readonly startedAt?: IsoDateTime;
  readonly finishedAt?: IsoDateTime;
}

export interface RunPatch {
  readonly state?: RunState;
  readonly cursor?: number;
  /** null 表示清空错误 */
  readonly error?: string | null;
}

export interface StepPatch {
  readonly status?: StepStatus;
  readonly inputHashes?: Readonly<Record<string, string>>;
  /** null 表示清空 */
  readonly outputs?: Readonly<Record<string, unknown>> | null;
  readonly wait?: WaitRequest | null;
  readonly error?: string | null;
  readonly attempts?: number;
  readonly startedAt?: IsoDateTime | null;
  readonly finishedAt?: IsoDateTime | null;
}

/**
 * 工作流引擎依赖的存储。记录库提供 SQLite 实现，单测用内存实现。
 * 所有方法同步执行（node:sqlite 本身是同步的）。
 */
export interface RunStore {
  createRun(run: RunRecord, steps: readonly StepRecord[]): void;
  getRun(runId: string): RunRecord | undefined;
  /** 按创建时间倒序 */
  listRuns(filter?: { readonly states?: readonly RunState[] }): RunRecord[];
  /**
   * 比较并交换：只有当前状态在 from 里时才改成 to，并同时应用 patch。
   * 返回 false 表示当前状态不在 from 里（比如另一个进程正在跑这次运行），调用方必须放弃。
   * 这是防止两个进程同时恢复同一次运行的唯一手段，实现必须是原子的。
   */
  transitionRun(
    runId: string,
    from: readonly RunState[],
    to: RunState,
    patch?: Omit<RunPatch, "state">,
  ): boolean;
  updateRun(runId: string, patch: RunPatch): void;
  /** 按 index 升序 */
  getSteps(runId: string): StepRecord[];
  updateStep(runId: string, stepId: string, patch: StepPatch): void;
}

/** 引擎每次 start / resume / cancel 之后的结果，skill 读它决定下一步 */
export interface RunReport {
  readonly runId: string;
  readonly workflowId: string;
  readonly state: RunState;
  /** 停在哪一步（等待中、失败时有） */
  readonly currentStep?: {
    readonly id: string;
    readonly title: string;
    readonly kind: StepKind;
  };
  readonly wait?: WaitRequest;
  readonly error?: string;
}
