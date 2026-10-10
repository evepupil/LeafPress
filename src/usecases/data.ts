import { setTimeout as delay } from "node:timers/promises";
import {
  addDays,
  buildDataset,
  DATASET_DAYS,
  pullNote,
  pullPlan,
  type PullOutcome,
  type UseCases,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import type { DataPullOutcome, DataPullResult } from "../platforms/types.js";
import type { AppContext } from "./context.js";
import {
  listAccounts,
  nowParts,
  redactText,
  redactTextWithSecrets,
  redactValueWithSecrets,
  requireAccount,
  secretValues,
} from "./support.js";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(app: AppContext, message: string): void {
  try {
    app.warn(message);
  } catch {
    // Warnings must not change the data-pull result.
  }
}

/**
 * 把数据工具报的进度交给调用方（带上账号编号）。工具是外部实现，说的话先抹掉密钥；
 * 调用方的回调出错只提醒一次，不影响拉取结果。调用方没要进度时返回 undefined，工具那头就不报。
 */
function accountProgress(
  app: AppContext,
  accountId: string,
  secrets: readonly string[],
  onProgress: ((accountId: string, message: string) => void) | undefined,
): ((message: string) => void) | undefined {
  if (typeof onProgress !== "function") return undefined;
  let warned = false;
  return (message) => {
    try {
      onProgress(
        accountId,
        redactTextWithSecrets(app, accountId, message, secrets),
      );
    } catch (error) {
      if (warned) return;
      warned = true;
      warn(
        app,
        redactTextWithSecrets(
          app,
          accountId,
          `账号 ${accountId} 的拉取进度回调出错，已忽略：${errorText(error)}`,
          secrets,
        ),
      );
    }
  };
}

function pullContext(
  app: AppContext,
  account: ReturnType<typeof requireAccount>,
  works: ReturnType<typeof app.store.works.list>,
  date: Date,
  today: string,
  lastSnapshotDay?: string,
  progress?: (message: string) => void,
) {
  return {
    account,
    works,
    today,
    now: date,
    ...(lastSnapshotDay === undefined ? {} : { lastSnapshotDay }),
    ...(progress === undefined ? {} : { progress }),
    setting(key: string) {
      return account.settings.find((setting) => setting.key === key)?.value;
    },
    secret(key: string) {
      return app.credentials.get(account.id, key);
    },
    exec: app.exec,
    fetch: app.fetch,
    sleep: (ms: number) => delay(ms),
  };
}

export function createDataUseCases(
  app: AppContext,
): Pick<UseCases, "pullData" | "dataset"> {
  return {
    async pullData(input) {
      const { at, date, today } = nowParts(app);
      if (
        input?.accountIds &&
        new Set(input.accountIds).size !== input.accountIds.length
      ) {
        throw new LeafPressError("USAGE", "账号不能重复");
      }
      const prepared = app.store.transaction(() => {
        const allAccounts = listAccounts(app);
        const selected =
          input?.accountIds === undefined
            ? allAccounts
            : input.accountIds.map((id) => requireAccount(app, id));
        const plan = pullPlan(selected, app.catalog);
        const works = app.store.works.list();
        const lastSnapshotDays = new Map<string, string>();
        for (const snapshot of app.store.snapshots.accountDays(
          "0000-01-01",
          addDays(today, -1),
        )) {
          const previous = lastSnapshotDays.get(snapshot.accountId);
          if (previous === undefined || snapshot.day > previous)
            lastSnapshotDays.set(snapshot.accountId, snapshot.day);
        }

        for (const action of plan) {
          if (action.action !== "blocked") continue;
          const account = selected.find(
            (candidate) => candidate.id === action.accountId,
          );
          if (!account) continue;
          const reason = redactText(app, account.id, action.reason);
          app.store.pulls.add({
            accountId: account.id,
            at,
            status: "failed",
            reason,
            fixHint: "请在账号接入设置中补全配置后重试。",
            note: reason,
          });
        }
        return { selected, plan, works, lastSnapshotDays };
      });

      const secretsByAccount = new Map(
        prepared.selected.map((account) => [
          account.id,
          secretValues(app, account.id),
        ]),
      );
      const outcomes: PullOutcome[] = [];
      for (const action of prepared.plan) {
        if (action.action === "skip") continue;
        const account = prepared.selected.find(
          (candidate) => candidate.id === action.accountId,
        );
        if (!account) continue;
        if (action.action === "blocked") {
          outcomes.push({
            accountId: account.id,
            status: "failed",
            reason: redactText(app, account.id, action.reason),
          });
          continue;
        }

        const secretsBefore =
          secretsByAccount.get(account.id) ?? secretValues(app, account.id);
        const progress = accountProgress(
          app,
          account.id,
          secretsBefore,
          input?.onProgress,
        );
        const tool = app.platforms.dataTool(account.platform);
        let outcome: DataPullOutcome;
        if (!tool) {
          outcome = { ok: false, reason: "内部错误：没有配置数据工具" };
        } else {
          try {
            outcome = await tool.pull(
              pullContext(
                app,
                account,
                prepared.works.filter((work) => work.accountId === account.id),
                date,
                today,
                prepared.lastSnapshotDays.get(account.id),
                progress,
              ),
            );
          } catch (error) {
            outcome = { ok: false, reason: `内部错误：${errorText(error)}` };
          }
        }

        const safeOutcome = redactValueWithSecrets(
          app,
          account.id,
          outcome,
          secretsBefore,
        );
        if (!safeOutcome.ok) {
          app.store.transaction(() => {
            if (safeOutcome.expiredKey !== undefined) {
              app.store.settings.markExpired(
                account.id,
                safeOutcome.expiredKey,
                safeOutcome.reason,
                at,
              );
            }
            app.store.pulls.add({
              accountId: account.id,
              at,
              status: "failed",
              reason: safeOutcome.reason,
              ...(safeOutcome.fixHint === undefined
                ? {}
                : { fixHint: safeOutcome.fixHint }),
              note: safeOutcome.reason,
            });
          });
          outcomes.push({
            accountId: account.id,
            status: "failed",
            reason: safeOutcome.reason,
          });
          continue;
        }

        const result: DataPullResult = safeOutcome.result;
        const note = redactTextWithSecrets(
          app,
          account.id,
          result.note ?? "全部入库",
          secretsBefore,
        );
        const skippedWorks: DataPullResult["works"] = [];
        try {
          app.store.transaction(() => {
            requireAccount(app, account.id);
            for (const record of result.account) {
              app.store.snapshots.putAccountDay({
                accountId: account.id,
                day: record.day,
                followers: record.followers,
                reads: record.reads ?? null,
                interactions: record.interactions ?? null,
              });
            }
            for (const record of result.works) {
              const work = app.store.works.get(record.workId);
              if (!work || work.accountId !== account.id) {
                skippedWorks.push(record);
                continue;
              }
              app.store.snapshots.putWorkSnapshot(record);
            }
            app.store.pulls.add({
              accountId: account.id,
              at,
              status: "ok",
              note,
            });
          });
        } catch (error) {
          const reason = redactTextWithSecrets(
            app,
            account.id,
            `内部错误：${errorText(error)}`,
            secretsBefore,
          );
          app.store.transaction(() =>
            app.store.pulls.add({
              accountId: account.id,
              at,
              status: "failed",
              reason,
              note: reason,
            }),
          );
          outcomes.push({ accountId: account.id, status: "failed", reason });
          continue;
        }
        for (const record of skippedWorks) {
          warn(
            app,
            redactTextWithSecrets(
              app,
              account.id,
              `账号 ${account.id} 的数据工具返回了不属于该账号的作品编号，已跳过：${record.workId}`,
              secretsBefore,
            ),
          );
        }
        outcomes.push({ accountId: account.id, status: "ok" });
      }

      const safeOutcomes = outcomes.map((outcome) => {
        const account = prepared.selected.find(
          (candidate) => candidate.id === outcome.accountId,
        );
        return account
          ? redactValueWithSecrets(
              app,
              account.id,
              outcome,
              secretsByAccount.get(account.id) ?? [],
            )
          : outcome;
      });
      let note = pullNote(safeOutcomes, prepared.selected);
      for (const account of prepared.selected)
        note = redactTextWithSecrets(
          app,
          account.id,
          note,
          secretsByAccount.get(account.id) ?? [],
        );
      return { outcomes: safeOutcomes, note };
    },

    dataset() {
      const { today } = nowParts(app);
      return app.store.transaction(() => {
        const accounts = listAccounts(app);
        const works = app.store.works.list();
        const from = addDays(today, -DATASET_DAYS);
        const to = addDays(today, -1);
        return buildDataset({
          today,
          accounts,
          works,
          accountDays: app.store.snapshots.accountDays(from, to),
          workSnapshots: app.store.snapshots.workSnapshots(from, to),
        });
      });
    },
  };
}
