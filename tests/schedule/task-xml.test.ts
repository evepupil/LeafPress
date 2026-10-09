import { describe, expect, it } from "vitest";

import { buildTaskXml } from "../../src/schedule/task-xml.js";

const now = new Date(2026, 9, 9, 12, 30, 0);

function build(at: string, time = now): string {
  return buildTaskXml({
    at,
    now: time,
    userId: "DESKTOP\\zhoutao",
    wrapperPath: "C:\\LeafPress\\schedule\\run-data-pull.ps1",
    workingDirectory: "C:\\LeafPress Data",
  });
}

describe("buildTaskXml", () => {
  it("生成下一个每日触发、当前用户、网络和失败重试设置", () => {
    const xml = build("06:15");

    expect(xml).toContain("<StartBoundary>2026-10-10T06:15:00</StartBoundary>");
    expect(xml).toContain("<DaysInterval>1</DaysInterval>");
    expect(xml).toContain(
      "<Description>LeafPress 每天拉作品数据（数据目录：C:\\LeafPress Data）</Description>",
    );
    expect(xml).toContain("<UserId>DESKTOP\\zhoutao</UserId>");
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(xml).toContain(
      "<RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>",
    );
    expect(xml).toContain(
      "<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    );
    expect(xml).toContain(
      "<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
    );
    expect(xml).toContain(
      "<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
    );
    expect(xml).toContain("<ExecutionTimeLimit>PT1H</ExecutionTimeLimit>");
    expect(xml).toContain(
      "<RestartOnFailure>\n      <Interval>PT30M</Interval>\n      <Count>3</Count>\n    </RestartOnFailure>",
    );
    expect(xml).toContain("<Command>powershell.exe</Command>");
    expect(xml).toContain(
      "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden",
    );
    expect(xml).toContain(
      "<WorkingDirectory>C:\\LeafPress Data</WorkingDirectory>",
    );
  });

  it("时间尚未到时从当天开始，已经到时从明天开始", () => {
    expect(build("06:00", new Date(2026, 9, 9, 5, 59, 59))).toContain(
      "<StartBoundary>2026-10-09T06:00:00</StartBoundary>",
    );
    expect(build("06:00", new Date(2026, 9, 9, 6, 0, 0))).toContain(
      "<StartBoundary>2026-10-10T06:00:00</StartBoundary>",
    );
  });

  it("转义 XML 路径、描述和身份中的保留字符", () => {
    const xml = buildTaskXml({
      at: "07:00",
      now,
      userId: "D&'OMAIN\\user<1>",
      wrapperPath: 'C:\\Leaf Press & <资料>\\run"now.ps1',
      workingDirectory: "C:\\LeafPress & <数据>",
    });

    expect(xml).toContain("<UserId>D&amp;&apos;OMAIN\\user&lt;1&gt;</UserId>");
    expect(xml).toContain(
      "-File &quot;C:\\Leaf Press &amp; &lt;资料&gt;\\run&quot;now.ps1&quot;",
    );
    expect(xml).toContain(
      "<Description>LeafPress 每天拉作品数据（数据目录：C:\\LeafPress &amp; &lt;数据&gt;）</Description>",
    );
    expect(xml).toContain(
      "<WorkingDirectory>C:\\LeafPress &amp; &lt;数据&gt;</WorkingDirectory>",
    );
  });

  it("拒绝超出 HH:mm 范围的时间", () => {
    expect(() => build("24:00")).toThrow("计划时间必须是 HH:mm 格式。");
  });
});
