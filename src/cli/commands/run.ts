/** run 命令：查询和取消工作流运行。 */
import { existsSync } from "node:fs";
import type { Command } from "commander";

import { WORKFLOWS } from "../../workflows/catalog.js";
import type {
  RunReport,
  RunState,
  WorkflowDefinition,
} from "../../workflows/types.js";
import type { RunDetail, WorkflowEngine } from "../../workflows/engine.js";
import type { RunRecord } from "../../workflows/types.js";
import { LeafPressError } from "../../shared/errors.js";
import type { CliContext } from "../context.js";
import { renderSuccessJson, renderTable } from "../output.js";

const ACTIVE_STATES: readonly RunState[] = ["running", "waiting", "failed"];

export interface RunListOptions {
  readonly all?: boolean | undefined;
}

export interface RunCancelOptions {
  readonly force?: boolean | undefined;
}

export interface RunDependencies {
  readonly engine?: WorkflowEngine;
  readonly workflows?: readonly WorkflowDefinition[];
}

export function executeRunList(
  context: CliContext,
  options: RunListOptions = {},
  dependencies: RunDependencies = {},
): RunRecord[] {
  if (!existsSync(context.paths.dbFile)) return [];
  const engine = dependencies.engine ?? context.getEngine();
  return options.all ? engine.list() : engine.list({ states: ACTIVE_STATES });
}

function throwRunNotFound(runId: string): never {
  throw new LeafPressError("RUN_NOT_FOUND", `找不到运行「${runId}」`);
}

export function executeRunShow(
  context: CliContext,
  runId: string,
  dependencies: RunDependencies = {},
): RunDetail {
  if (!existsSync(context.paths.dbFile)) throwRunNotFound(runId);
  const engine = dependencies.engine ?? context.getEngine();
  return engine.show(runId);
}

export function executeRunCancel(
  context: CliContext,
  runId: string,
  options: RunCancelOptions = {},
  dependencies: RunDependencies = {},
): RunReport {
  if (!existsSync(context.paths.dbFile)) throwRunNotFound(runId);
  const engine = dependencies.engine ?? context.getEngine();
  return options.force === undefined
    ? engine.cancel(runId)
    : engine.cancel(runId, { force: options.force });
}

const RUN_STATE_LABEL: Record<RunState, string> = {
  running: "运行中",
  waiting: "等待中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: "待运行",
  running: "运行中",
  waiting: "等待中",
  done: "已完成",
  failed: "失败",
};

const STEP_KIND_LABEL: Record<string, string> = {
  code: "代码",
  ai: "AI",
  confirm: "确认",
  handoff: "交接",
  manual: "手动",
};

function workflowById(
  id: string,
  workflows: readonly WorkflowDefinition[],
): WorkflowDefinition | undefined {
  return workflows.find((workflow) => workflow.id === id);
}

function localMinute(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function renderRunList(
  runs: readonly RunRecord[],
  workflows: readonly WorkflowDefinition[] = WORKFLOWS,
  emptyMessage = "没有未结束的运行",
): string {
  if (runs.length === 0) return emptyMessage;
  return renderTable(
    ["编号", "工作流", "状态", "停在", "更新时间"],
    runs.map((run) => {
      const workflow = workflowById(run.workflowId, workflows);
      return [
        run.id,
        workflow?.title ?? run.workflowId,
        RUN_STATE_LABEL[run.state],
        workflow?.steps[run.cursor]?.title ?? "—",
        localMinute(run.updatedAt),
      ];
    }),
  );
}

function stepKind(
  detail: RunDetail,
  stepId: string,
  workflow: WorkflowDefinition | undefined,
): string {
  const kind = workflow?.steps.find((step) => step.id === stepId)?.kind;
  if (kind !== undefined) return STEP_KIND_LABEL[kind] ?? kind;
  if (
    detail.wait !== undefined &&
    detail.steps.some(
      (step) => step.stepId === stepId && step.status === "waiting",
    )
  ) {
    return STEP_KIND_LABEL[detail.wait.kind] ?? detail.wait.kind;
  }
  return "—";
}

export function renderRunShow(
  detail: RunDetail,
  workflows: readonly WorkflowDefinition[] = WORKFLOWS,
): string {
  const workflow = workflowById(detail.workflowId, workflows);
  const basicInfo = renderTable(
    ["属性", "内容"],
    [
      ["运行编号", detail.runId],
      ["工作流", workflow?.title ?? detail.workflowId],
      ["状态", RUN_STATE_LABEL[detail.state]],
      ...(detail.currentStep === undefined
        ? []
        : [["停在", detail.currentStep.title]]),
    ],
  );
  const steps = renderTable(
    ["序号", "步骤", "种类", "状态", "次数"],
    detail.steps.map((step) => [
      String(step.index + 1),
      workflow?.steps[step.index]?.title ?? step.stepId,
      stepKind(detail, step.stepId, workflow),
      STEP_STATUS_LABEL[step.status] ?? step.status,
      String(step.attempts),
    ]),
  );
  const wait = detail.wait;
  const waitLines =
    wait === undefined
      ? []
      : [
          `等待：${wait.message}`,
          ...(wait.choices === undefined || wait.choices.length === 0
            ? []
            : [
                `选项：${wait.choices.map((choice) => `${choice.id} ${choice.label}`).join("；")}`,
              ]),
          ...(
            [
              ["任务文件", wait.taskFile],
              ["结果文件", wait.outputFile],
              ["预览文件", wait.previewFile],
              ["交接目录", wait.handoffDir],
            ] as readonly (readonly [string, string | undefined])[]
          ).flatMap(([label, path]) =>
            path === undefined ? [] : [`${label}：${path}`],
          ),
        ];
  const failedStep = detail.steps.find((step) => step.status === "failed");
  const error = detail.error ?? failedStep?.error;
  return [
    basicInfo,
    "步骤",
    steps,
    ...waitLines,
    ...(error === undefined ? [] : [`错误：${error}`]),
  ].join("\n");
}

export function renderRunCancel(
  report: RunReport,
  workflows: readonly WorkflowDefinition[] = WORKFLOWS,
): string {
  const workflow = workflowById(report.workflowId, workflows);
  return renderTable(
    ["属性", "内容"],
    [
      ["运行编号", report.runId],
      ["工作流", workflow?.title ?? report.workflowId],
      ["状态", RUN_STATE_LABEL[report.state]],
      ...(report.currentStep === undefined
        ? []
        : [["停在", report.currentStep.title]]),
    ],
  );
}

export function register(program: Command, getContext: () => CliContext): void {
  const run = program.command("run").description("查看或取消工作流运行");

  run
    .command("list")
    .description("列出工作流运行")
    .option("--all", "包括已结束的运行")
    .action((options: RunListOptions) => {
      const context = getContext();
      const hasDatabase = existsSync(context.paths.dbFile);
      const result = executeRunList(context, options);
      const output = context.globalOptions.json
        ? renderSuccessJson({ runs: result })
        : renderRunList(
            result,
            undefined,
            !hasDatabase || options.all ? "没有运行记录" : "没有未结束的运行",
          );
      process.stdout.write(`${output}\n`);
    });

  run
    .command("show <runId>")
    .description("显示一次运行详情")
    .action((runId: string) => {
      const context = getContext();
      const result = executeRunShow(context, runId);
      const output = context.globalOptions.json
        ? renderSuccessJson({ run: result })
        : renderRunShow(result);
      process.stdout.write(`${output}\n`);
    });

  run
    .command("cancel <runId>")
    .description("取消等待中或失败的运行")
    .option("--force", "接管租约过期的运行")
    .action((runId: string, options: RunCancelOptions) => {
      const context = getContext();
      const result = executeRunCancel(context, runId, options);
      const output = context.globalOptions.json
        ? renderSuccessJson({ run: result })
        : renderRunCancel(result);
      process.stdout.write(`${output}\n`);
    });
}
