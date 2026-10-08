import type { SettingsRepo } from "./types.js";
import {
  readRepo,
  requiredString,
  writeRepo,
  type RepoContext,
  type SqlRow,
} from "./repo-common.js";

export function createSettingsRepo(context: RepoContext): SettingsRepo {
  return {
    values(accountId) {
      return readRepo("account_settings", "account_id, key, value", () => {
        const rows = context.db
          .prepare(
            "SELECT key, value FROM account_settings WHERE account_id = ? AND value IS NOT NULL ORDER BY key",
          )
          .all(accountId);
        return Object.fromEntries(
          rows.map((raw) => {
            const row = raw as SqlRow;
            return [
              requiredString(row, "key", "account_settings"),
              requiredString(row, "value", "account_settings"),
            ];
          }),
        );
      });
    },
    expired(accountId) {
      return readRepo(
        "account_settings",
        "account_id, key, expired_reason",
        () => {
          const rows = context.db
            .prepare(
              "SELECT key, expired_reason FROM account_settings WHERE account_id = ? AND expired_reason IS NOT NULL ORDER BY key",
            )
            .all(accountId);
          return Object.fromEntries(
            rows.map((raw) => {
              const row = raw as SqlRow;
              return [
                requiredString(row, "key", "account_settings"),
                requiredString(row, "expired_reason", "account_settings"),
              ];
            }),
          );
        },
      );
    },
    set(accountId, key, value, at) {
      writeRepo(
        context,
        "account_settings",
        "account_id, key, value, expired_reason, updated_at",
        () => {
          context.db
            .prepare(
              `INSERT INTO account_settings (account_id, key, value, expired_reason, updated_at)
          VALUES (?, ?, ?, NULL, ?) ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value, expired_reason = NULL, updated_at = excluded.updated_at`,
            )
            .run(accountId, key, value ?? null, at);
        },
      );
    },
    clear(accountId, key) {
      writeRepo(context, "account_settings", "account_id, key", () => {
        context.db
          .prepare(
            "DELETE FROM account_settings WHERE account_id = ? AND key = ?",
          )
          .run(accountId, key);
      });
    },
    markExpired(accountId, key, reason, at) {
      writeRepo(
        context,
        "account_settings",
        "account_id, key, value, expired_reason, updated_at",
        () => {
          context.db
            .prepare(
              `INSERT INTO account_settings (account_id, key, value, expired_reason, updated_at)
          VALUES (?, ?, NULL, ?, ?) ON CONFLICT(account_id, key) DO UPDATE SET expired_reason = excluded.expired_reason, updated_at = excluded.updated_at`,
            )
            .run(accountId, key, reason, at);
        },
      );
    },
  };
}
