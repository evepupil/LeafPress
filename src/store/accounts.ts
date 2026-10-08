import type { AccountRow, AccountsRepo } from "./types.js";
import {
  ensureUpdated,
  optionalString,
  readRepo,
  requiredString,
  writeRepo,
  type RepoContext,
  type SqlRow,
} from "./repo-common.js";

const ACCOUNT_COLUMNS =
  "id, platform, name, handle, url, stage, since, created_at, updated_at";

export function createAccountsRepo(context: RepoContext): AccountsRepo {
  const mapRow = (row: SqlRow): AccountRow => ({
    id: requiredString(row, "id", "accounts"),
    platform: requiredString(
      row,
      "platform",
      "accounts",
    ) as AccountRow["platform"],
    name: requiredString(row, "name", "accounts"),
    ...(optionalString(row, "handle", "accounts") === undefined
      ? {}
      : { handle: optionalString(row, "handle", "accounts") }),
    ...(optionalString(row, "url", "accounts") === undefined
      ? {}
      : { url: optionalString(row, "url", "accounts") }),
    stage: requiredString(row, "stage", "accounts") as AccountRow["stage"],
    since: requiredString(row, "since", "accounts"),
    createdAt: requiredString(row, "created_at", "accounts"),
    updatedAt: requiredString(row, "updated_at", "accounts"),
  });

  function values(row: AccountRow): readonly (string | null)[] {
    return [
      row.id,
      row.platform,
      row.name,
      row.handle ?? null,
      row.url ?? null,
      row.stage,
      row.since,
      row.createdAt,
      row.updatedAt,
    ];
  }

  return {
    list() {
      return readRepo("accounts", ACCOUNT_COLUMNS, () =>
        context.db
          .prepare(
            `SELECT ${ACCOUNT_COLUMNS} FROM accounts ORDER BY created_at, id`,
          )
          .all()
          .map((row) => mapRow(row)),
      );
    },
    get(id) {
      return readRepo("accounts", ACCOUNT_COLUMNS, () => {
        const row = context.db
          .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`)
          .get(id);
        return row === undefined ? undefined : mapRow(row);
      });
    },
    insert(row) {
      writeRepo(context, "accounts", ACCOUNT_COLUMNS, () => {
        context.db
          .prepare(
            `INSERT INTO accounts (${ACCOUNT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(...values(row));
      });
    },
    update(row) {
      writeRepo(context, "accounts", ACCOUNT_COLUMNS, () => {
        const result = context.db
          .prepare(
            `UPDATE accounts SET platform = ?, name = ?, handle = ?, url = ?, stage = ?, since = ?, created_at = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            row.platform,
            row.name,
            row.handle ?? null,
            row.url ?? null,
            row.stage,
            row.since,
            row.createdAt,
            row.updatedAt,
            row.id,
          );
        ensureUpdated(result, "accounts", "id");
      });
    },
  };
}
