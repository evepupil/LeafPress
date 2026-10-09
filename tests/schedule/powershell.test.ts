import { describe, expect, it } from "vitest";

import {
  describeFailure,
  failureMessage,
  limitReason,
  powershellArgs,
} from "../../src/schedule/powershell.js";
import { REPLACEMENT_CHAR, base64, ok } from "./support.js";

describe("limitReason", () => {
  it("把换行和连续空白折成一个空格", () => {
    expect(limitReason("  错误: 任务 XML 有问题。\r\r\n\n(1,3):Task:\t ")).toBe(
      "错误: 任务 XML 有问题。 (1,3):Task:",
    );
  });

  it("300 字以内原样保留，超过则截到 300 字（省略号算在内）", () => {
    const exact = "字".repeat(300);
    expect(limitReason(exact)).toBe(exact);

    const cut = limitReason("字".repeat(301));
    expect(Array.from(cut)).toHaveLength(300);
    expect(cut).toBe(`${"字".repeat(299)}…`);
  });

  it("按字符而不是按 UTF-16 单元截，不会把一个字拆成两半", () => {
    const cut = limitReason("😀".repeat(400));
    expect(Array.from(cut)).toHaveLength(300);
    expect(cut).toBe(`${"😀".repeat(299)}…`);
    expect(cut).not.toContain(REPLACEMENT_CHAR);
  });
});

describe("failureMessage", () => {
  it("有原因就带上，没有就只说失败", () => {
    expect(failureMessage("注册计划任务失败", "拒绝访问。")).toBe(
      "注册计划任务失败：拒绝访问。",
    );
    expect(failureMessage("注册计划任务失败", "")).toBe("注册计划任务失败。");
  });
});

describe("describeFailure", () => {
  it("优先用脚本自己报的原因（base64 的 UTF-8，不受代码页影响）", () => {
    expect(
      describeFailure({
        ...ok,
        exitCode: 1,
        stdout: JSON.stringify({
          error: base64("拒绝访问。\n请以管理员身份运行"),
        }),
        stderr: REPLACEMENT_CHAR.repeat(2),
      }),
    ).toBe("拒绝访问。 请以管理员身份运行");
  });

  it("脚本没报原因时，错误输出干净才展示；出现乱码字符就只说退出码", () => {
    expect(
      describeFailure({ ...ok, exitCode: 1, stderr: "plain failure\r\n" }),
    ).toBe("plain failure");
    expect(
      describeFailure({
        ...ok,
        exitCode: 3,
        stderr: `${REPLACEMENT_CHAR}: bad`,
      }),
    ).toBe("PowerShell 退出码 3");
    expect(describeFailure({ ...ok, exitCode: 2 })).toBe("PowerShell 退出码 2");
  });

  it("超时就说超时", () => {
    expect(describeFailure({ ...ok, exitCode: -1, timedOut: true })).toBe(
      "命令超时",
    );
  });
});

describe("powershellArgs", () => {
  it("非交互、不读用户配置、绕过执行策略，脚本放在最后", () => {
    expect(powershellArgs("Get-Date")).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Get-Date",
    ]);
  });
});
