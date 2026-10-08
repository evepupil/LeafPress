import { existsSync } from "node:fs";
import {
  setupView,
  type Account,
  type AccountStage,
  type AddAccountInput,
  type UpdateAccountInput,
  type UseCases,
} from "@leafpress/core";
import { LeafPressError } from "../shared/errors.js";
import { profilePath, readProfile, writeProfile } from "../files/profiles.js";
import type { AppContext } from "./context.js";
import {
  accountFromRow,
  getAccount,
  listAccounts as readAccounts,
  nowParts,
  requireAccount,
  redactValue,
} from "./support.js";
import type { AccountRow } from "../store/types.js";

const ACCOUNT_STAGES = new Set<AccountStage>(["active", "preparing", "paused"]);

export function createAccountsUseCases(
  app: AppContext,
): Pick<
  UseCases,
  | "listAccounts"
  | "showAccount"
  | "addAccount"
  | "updateAccount"
  | "saveProfile"
  | "setSetting"
> {
  return {
    listAccounts() {
      return app.store.transaction(() =>
        readAccounts(app).map((account) =>
          redactValue(app, account.id, account),
        ),
      );
    },

    showAccount(id) {
      return app.store.transaction(() => {
        const account = requireAccount(app, id);
        const pull = app.store.pulls
          .latest()
          .find((record) => record.accountId === id);
        return {
          account: redactValue(app, id, account),
          setup: setupView(account, app.catalog[account.platform], {
            ...(pull === undefined ? {} : { pull }),
          }),
        };
      });
    },

    addAccount(input: AddAccountInput): Account {
      const { at, today } = nowParts(app);
      const created = app.store.transaction(() => {
        if (!Object.hasOwn(app.catalog, input.platform))
          throw new LeafPressError(
            "USAGE",
            `平台不合法：${String(input.platform)}`,
          );
        const platform = app.catalog[input.platform];
        if (!platform)
          throw new LeafPressError(
            "USAGE",
            `平台不合法：${String(input.platform)}`,
          );
        const name = input.name.trim();
        if (!name) throw new LeafPressError("USAGE", "账号名称不能为空");
        const settings = input.settings ?? {};
        for (const key of Object.keys(settings)) {
          if (!platform.setupItems.some((item) => item.key === key)) {
            throw new LeafPressError(
              "USAGE",
              `${platform.name}没有这个配置项：${key}`,
            );
          }
        }
        const id = `${input.platform}-${app.store.meta.nextSerial("account")}`;
        const row: AccountRow = {
          id,
          platform: input.platform,
          name,
          ...(input.handle === undefined
            ? {}
            : { handle: input.handle.trim() }),
          ...(input.url === undefined ? {} : { url: input.url.trim() }),
          stage: "active",
          since: today,
          createdAt: at,
          updatedAt: at,
        };
        app.store.accounts.insert(row);
        for (const [key, value] of Object.entries(settings)) {
          const definition = platform.setupItems.find(
            (item) => item.key === key,
          );
          if (definition?.secret)
            app.store.settings.set(id, key, undefined, at);
          else app.store.settings.set(id, key, value.trim(), at);
        }
        return { row, settings };
      });

      for (const [key, value] of Object.entries(created.settings)) {
        const definition = app.catalog[created.row.platform].setupItems.find(
          (item) => item.key === key,
        );
        if (definition?.secret && value.trim())
          app.credentials.set(created.row.id, key, value);
      }
      const profileFile = profilePath(app.paths, created.row.id);
      if (input.intro.trim() && !existsSync(profileFile))
        writeProfile(app.paths, created.row.id, input.intro.trim());
      const account = app.store.transaction(() =>
        accountFromRow(
          app,
          app.store.accounts.get(created.row.id) ?? created.row,
        ),
      );
      return redactValue(app, account.id, account);
    },

    updateAccount(id: string, patch: UpdateAccountInput): Account {
      const { at } = nowParts(app);
      const updated = app.store.transaction(() => {
        const account = app.store.accounts.get(id);
        if (!account)
          throw new LeafPressError("NOT_FOUND", `没有这个账号：${id}`);
        if (patch.name !== undefined && !patch.name.trim())
          throw new LeafPressError("USAGE", "账号名称不能为空");
        if (patch.stage !== undefined && !ACCOUNT_STAGES.has(patch.stage))
          throw new LeafPressError("USAGE", "账号阶段不合法");
        const next: AccountRow = {
          ...account,
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
          ...(patch.stage === undefined ? {} : { stage: patch.stage }),
          updatedAt: at,
        };
        if (patch.handle === null) delete next.handle;
        else if (patch.handle !== undefined) next.handle = patch.handle.trim();
        if (patch.url === null) delete next.url;
        else if (patch.url !== undefined) next.url = patch.url.trim();
        app.store.accounts.update(next);
        return accountFromRow(app, next);
      });
      return redactValue(app, id, updated);
    },

    saveProfile(id: string, profile: string): Account {
      const account = app.store.transaction(() => requireAccount(app, id));
      writeProfile(app.paths, id, profile);
      const updated = app.store.transaction(() => {
        const row = app.store.accounts.get(id);
        if (!row) throw new LeafPressError("NOT_FOUND", `没有这个账号：${id}`);
        return {
          ...account,
          profile: readProfile(app.paths, id),
          profilePath: profilePath(app.paths, id),
        };
      });
      return redactValue(app, id, updated);
    },

    setSetting(id: string, key: string, value: string): Account {
      const { at } = nowParts(app);
      const action = app.store.transaction(() => {
        const account = requireAccount(app, id);
        const definition = app.catalog[account.platform].setupItems.find(
          (item) => item.key === key,
        );
        if (!definition)
          throw new LeafPressError(
            "USAGE",
            `${app.catalog[account.platform].name}没有这个配置项：${key}`,
          );
        const normalized = value.trim();
        if (!normalized) {
          app.store.settings.clear(id, key);
          return { secret: definition.secret, operation: "clear" as const };
        }
        if (definition.secret) {
          app.store.settings.set(id, key, undefined, at);
          return { secret: true, operation: "set" as const, value: normalized };
        }
        app.store.settings.set(id, key, normalized, at);
        return { secret: false, operation: "done" as const };
      });
      if (action.operation === "clear" && action.secret)
        app.credentials.remove(id, key);
      if (action.operation === "set" && action.secret)
        app.credentials.set(id, key, action.value);
      return app.store.transaction(() => {
        const account = getAccount(app, id);
        if (!account)
          throw new LeafPressError("NOT_FOUND", `没有这个账号：${id}`);
        return redactValue(app, id, account);
      });
    },
  };
}
