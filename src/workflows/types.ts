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
  /**
   * 续约：耗时长的步骤（比如上传大视频）要隔几分钟调一次，告诉引擎「我还活着」。
   * 执行权已被别的进程接管时抛 LeafPressError("RUN_STATE_CONFLICT")，步骤应立即停止。
   */
  heartbeat(): void;
}

export interface StepDefinition<P extends WorkflowParams = WorkflowParams> {
  /** 在工作流内唯一、稳定的编号，比如 "rewrite" */
  readonly id: string;
  readonly kind: StepKind;
  /** 中文名，比如「改写」 */
  readonly title: string;
  /**
   * 本步骤依赖的输入文件（绝对路径），只能是上游产出或外部文件，不能是本步骤自己的产出。
   * 引擎在步骤每次开始执行前给它们拍快照（记哈希）；执行结束时、以及之后每次恢复时，
   * 只要有一个文件和快照对不上（变了或消失了），就从本步骤起往后全部作废重跑。
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
  /** 当前持有执行权的进程令牌；只有 running 时有 */
  readonly leaseOwner?: string;
  /** 执行权的租约到期时间；持有者要在到期前续约，过期视为上次异常退出 */
  readonly leaseExpiresAt?: IsoDateTime;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface StepRecord {
  readonly runId: string;
  readonly stepId: string;
  readonly index: number;
  readonly status: StepStatus;
  /** 最近一次开始执行时拍下的输入文件快照：绝对路径 → sha256（缺失为 "absent"） */
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

export interface AcquireRunOptions {
  /** 允许从这些状态取得执行权，通常是 waiting、failed */
  readonly from: readonly RunState[];
  /** 本进程的令牌 */
  readonly owner: string;
  readonly leaseExpiresAt: IsoDateTime;
  /** 当前时间，用来判断别人的租约是否已过期 */
  readonly now: IsoDateTime;
  /** 为 true 时，状态为 running 且租约已过期（leaseExpiresAt 早于 now）的运行也可以被取得（作者确认上次异常退出后的接管） */
  readonly takeOverExpired: boolean;
  readonly patch?: Omit<RunPatch, "state">;
}

/**
 * 工作流引擎依赖的存储。记录库提供 SQLite 实现，单测用内存实现。
 * 所有方法同步执行（node:sqlite 本身是同步的）。
 *
 * 执行权靠「租约」保证同一时刻只有一个进程在推进一次运行：
 * 取得（acquireRun）→ 推进中定期续约（renewLease）→ 停下时交还（releaseRun）。
 * 以下标明「原子」的方法，实现必须在一条带条件的语句或一个事务里完成判断和修改。
 */
export interface RunStore {
  /** 新建运行（通常直接以 running 状态、带上本进程的租约创建）和全部步骤记录 */
  createRun(run: RunRecord, steps: readonly StepRecord[]): void;
  getRun(runId: string): RunRecord | undefined;
  /** 按创建时间倒序 */
  listRuns(filter?: { readonly states?: readonly RunState[] }): RunRecord[];
  /**
   * 原子：满足条件时把状态改成 running，写入租约持有者和到期时间，应用 patch，返回 true。
   * 条件：当前状态在 from 里；或 takeOverExpired 为 true 且状态为 running、租约已过期。
   * 返回 false 表示没取到（比如另一个进程正持有），调用方必须放弃，什么都不能改。
   */
  acquireRun(runId: string, options: AcquireRunOptions): boolean;
  /** 原子：只有状态为 running 且持有者是 owner 时，才把租约到期时间改成 leaseExpiresAt */
  renewLease(
    runId: string,
    owner: string,
    leaseExpiresAt: IsoDateTime,
  ): boolean;
  /**
   * 原子：只有持有者是 owner 时，才把状态改成 to（waiting、completed、failed、cancelled），
   * 清空租约，应用 patch。
   */
  releaseRun(
    runId: string,
    owner: string,
    to: Exclude<RunState, "running">,
    patch?: Omit<RunPatch, "state">,
  ): boolean;
  /**
   * 原子比较并交换状态，不看租约（取消等待中、失败的运行时用）：当前状态在 from 里才改成 to，
   * 应用 patch；to 不是 running 时清空租约。
   */
  transitionRun(
    runId: string,
    from: readonly RunState[],
    to: RunState,
    patch?: Omit<RunPatch, "state">,
  ): boolean;
  /** 直接修改（持有执行权时用，比如回退时改游标） */
  updateRun(runId: string, patch: RunPatch): void;
  /** 按 index 升序 */
  getSteps(runId: string): StepRecord[];
  updateStep(runId: string, stepId: string, patch: StepPatch): void;
  /** 原子：在同一个事务里更新这一步的记录，并把运行的游标设为 nextCursor（防止「这步已完成、游标却没前进」） */
  completeStep(
    runId: string,
    stepId: string,
    patch: StepPatch,
    nextCursor: number,
  ): void;
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
