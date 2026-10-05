import { describe, expect, it } from "vitest";
import {
  checkZhihuDeveloper,
  DEVELOPER_APPLY_URL,
  DEVELOPER_SECRET_ENV,
  loadZhihuDeveloper,
} from "../../src/config/zhihu-developer.js";
import { LeafPressError } from "../../src/shared/errors.js";

/** 故意挑的、非常特别的密钥值，专门用来断言「不泄露」 */
const SECRET = "DEVSECRET-zz9-unique";
const OTHER_SECRET = "DEVSECRET-zz9-other";

const noConfig = { zhihu: {} };
const configWith = (secret: string) => ({
  zhihu: { developerAccessSecret: secret },
});

describe("checkZhihuDeveloper：判定顺序", () => {
  it("都没有设置 → missing，detail 写明去哪生成", () => {
    const status = checkZhihuDeveloper({ env: {}, config: noConfig });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "missing",
    });
    expect(status.detail).toContain(DEVELOPER_APPLY_URL);
    expect(status.detail).toContain(DEVELOPER_SECRET_ENV);
    expect(status.source).toBeUndefined();
  });

  it("只有环境变量 → ok，来源 env", () => {
    const status = checkZhihuDeveloper({
      env: { [DEVELOPER_SECRET_ENV]: SECRET },
      config: noConfig,
    });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "ok",
      source: "env",
    });
    expect(status.detail).not.toContain(SECRET);
  });

  it("只有配置 → ok，来源 config", () => {
    const status = checkZhihuDeveloper({
      env: {},
      config: configWith(SECRET),
    });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "ok",
      source: "config",
    });
    expect(status.detail).not.toContain(SECRET);
  });

  it("两边都有且不同 → conflict，detail 只说来源，不出现值", () => {
    const status = checkZhihuDeveloper({
      env: { [DEVELOPER_SECRET_ENV]: SECRET },
      config: configWith(OTHER_SECRET),
    });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "conflict",
    });
    expect(status.detail).not.toContain(SECRET);
    expect(status.detail).not.toContain(OTHER_SECRET);
  });

  it("两边都有且相同 → ok，环境变量优先", () => {
    const status = checkZhihuDeveloper({
      env: { [DEVELOPER_SECRET_ENV]: SECRET },
      config: configWith(SECRET),
    });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "ok",
      source: "env",
    });
  });

  it("环境变量是空串视同没设置，落到配置", () => {
    const status = checkZhihuDeveloper({
      env: { [DEVELOPER_SECRET_ENV]: "" },
      config: configWith(SECRET),
    });
    expect(status).toMatchObject({
      name: "zhihu-developer",
      state: "ok",
      source: "config",
    });
  });
});

describe("loadZhihuDeveloper：读取密钥", () => {
  it("环境变量优先返回", () => {
    const loaded = loadZhihuDeveloper({
      env: { [DEVELOPER_SECRET_ENV]: SECRET },
      config: configWith(SECRET),
    });
    // 两边值相同时不算冲突，且环境变量优先
    expect(loaded.source).toBe("env");
    expect(loaded.accessSecret).toBe(SECRET);
  });

  it("没有环境变量时返回配置里的", () => {
    const loaded = loadZhihuDeveloper({ env: {}, config: configWith(SECRET) });
    expect(loaded).toEqual({ accessSecret: SECRET, source: "config" });
  });

  it("missing 时抛 CREDENTIAL_MISSING，错误是 LeafPressError", () => {
    try {
      loadZhihuDeveloper({ env: {}, config: noConfig });
      expect.unreachable("应该抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LeafPressError);
      const e = error as LeafPressError;
      expect(e.code).toBe("CREDENTIAL_MISSING");
      expect(e.message).toContain(DEVELOPER_APPLY_URL);
    }
  });

  it("conflict 时抛 CREDENTIAL_CONFLICT", () => {
    try {
      loadZhihuDeveloper({
        env: { [DEVELOPER_SECRET_ENV]: SECRET },
        config: configWith(OTHER_SECRET),
      });
      expect.unreachable("应该抛错");
    } catch (error) {
      expect(error).toBeInstanceOf(LeafPressError);
      expect((error as LeafPressError).code).toBe("CREDENTIAL_CONFLICT");
    }
  });
});

describe("不泄露：每个分支的 detail 和错误信息都不含密钥值", () => {
  const envVariants: Array<Record<string, string>> = [
    {},
    { [DEVELOPER_SECRET_ENV]: SECRET },
    { [DEVELOPER_SECRET_ENV]: OTHER_SECRET },
    { [DEVELOPER_SECRET_ENV]: "" },
  ];
  const configVariants: Array<{ zhihu?: { developerAccessSecret?: string } }> =
    [noConfig, configWith(SECRET), configWith(OTHER_SECRET)];

  for (const env of envVariants) {
    for (const config of configVariants) {
      const secretInConfig = config.zhihu?.developerAccessSecret;
      const configLabel = !secretInConfig
        ? "无"
        : secretInConfig === SECRET
          ? "SECRET"
          : "OTHER";
      const envKey = Object.keys(env)[0] ?? "无";
      const envValue = Object.values(env)[0] ?? "-";
      const label = `env=${envKey}:${envValue} config=${configLabel}`;
      it(`组合 ${label}：detail、message、hint 都不含密钥值`, () => {
        const status = checkZhihuDeveloper({ env, config });
        expect(status.detail).not.toContain(SECRET);
        expect(status.detail).not.toContain(OTHER_SECRET);

        try {
          loadZhihuDeveloper({ env, config });
        } catch (error) {
          const e = error as LeafPressError;
          expect(e.message).not.toContain(SECRET);
          expect(e.message).not.toContain(OTHER_SECRET);
          expect(e.hint ?? "").not.toContain(SECRET);
          expect(e.hint ?? "").not.toContain(OTHER_SECRET);
        }
      });
    }
  }
});
