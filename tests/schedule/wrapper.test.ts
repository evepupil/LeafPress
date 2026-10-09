import { describe, expect, it } from "vitest";

import { buildWrapperScript } from "../../src/schedule/wrapper.js";

const input = {
  nodePath: "C:\\Tools\\O'Brien & Node\\node.exe",
  entryPath: "C:\\LeafPress\\入口 file.js",
  homePath: "C:\\Data Files\\LeafPress",
};

describe("buildWrapperScript", () => {
  it("生成可解析的元数据、日志重定向并传递 Node 退出码", () => {
    const script = buildWrapperScript(input);
    const nodeBase64 = Buffer.from(input.nodePath, "utf8").toString("base64");
    const entryBase64 = Buffer.from(input.entryPath, "utf8").toString("base64");

    expect(script).toContain(`# LeafPressNodePath: ${nodeBase64}`);
    expect(script).toContain(`# LeafPressEntryPath: ${entryBase64}`);
    expect(script).toContain(
      "-FilePath 'C:\\Tools\\O''Brien & Node\\node.exe'",
    );
    expect(script).toContain(
      '-ArgumentList \'"C:\\LeafPress\\入口 file.js" data pull --scheduled --home "C:\\Data Files\\LeafPress"\'',
    );
    expect(script).toContain(
      "-RedirectStandardOutput 'C:\\Data Files\\LeafPress\\logs\\data-pull.out.log'",
    );
    expect(script).toContain(
      "-RedirectStandardError 'C:\\Data Files\\LeafPress\\logs\\data-pull.err.log'",
    );
    expect(script).toMatch(/exit \$process\.ExitCode\s*$/);
  });

  it("转义启动参数中的单引号", () => {
    const script = buildWrapperScript({
      nodePath: "C:\\node.exe",
      entryPath: "C:\\O'Brien\\main.js",
      homePath: "C:\\User's Data",
    });

    expect(script).toContain(
      "'\"C:\\O''Brien\\main.js\" data pull --scheduled --home \"C:\\User''s Data\"'",
    );
  });

  it("弯单引号也各写两遍，路径里有 ’ 不会让脚本语法错误", () => {
    const script = buildWrapperScript({
      nodePath: "C:\\Tools\\it\u2019s\\node.exe",
      entryPath: "C:\\\u2018Leaf\u201BPress\\main\u201A.js",
      homePath: "C:\\Data\u2019s",
    });

    expect(script).toContain(
      "-FilePath 'C:\\Tools\\it\u2019\u2019s\\node.exe'",
    );
    expect(script).toContain(
      '-ArgumentList \'"C:\\\u2018\u2018Leaf\u201B\u201BPress\\main\u201A\u201A.js" data pull --scheduled --home "C:\\Data\u2019\u2019s"\'',
    );
    expect(script).toContain(
      "-RedirectStandardError 'C:\\Data\u2019\u2019s\\logs\\data-pull.err.log'",
    );
  });

  it("node 起不来时把原因写进错误日志并以 1 退出，不会取空进程对象的退出码", () => {
    const script = buildWrapperScript(input);
    const errorLog = "'C:\\Data Files\\LeafPress\\logs\\data-pull.err.log'";

    expect(script).toContain(`$errorLog = ${errorLog}`);
    expect(script).toContain("-PassThru");
    expect(script).toContain("-ErrorAction Stop");
    expect(script).toMatch(
      /\} catch \{\s*\$failure = \$_\.Exception\.Message\s*\}/u,
    );
    expect(script).toContain("[IO.File]::WriteAllText($errorLog,");
    expect(script).toContain("Text.UTF8Encoding($false)");
    expect(script).toContain(
      "'无法启动 node（C:\\Tools\\O''Brien & Node\\node.exe）：'",
    );
    expect(script).toContain("if ($null -ne $failure) {");
    expect(script).toContain("  exit 1\n}\nexit $process.ExitCode");

    // 先确认拿到了进程对象，才去取退出码
    const nullCheck = script.indexOf("$null -eq $process)");
    const exitCodeCheck = script.indexOf("$null -eq $process.ExitCode");
    const passThrough = script.lastIndexOf("exit $process.ExitCode");
    expect(nullCheck).toBeGreaterThan(0);
    expect(exitCodeCheck).toBeGreaterThan(nullCheck);
    expect(passThrough).toBeGreaterThan(exitCodeCheck);
  });

  it("每次先确保日志目录在，被清理掉也能写出错误日志", () => {
    const script = buildWrapperScript(input);

    expect(script).toContain(
      "New-Item -ItemType Directory -Force -Path 'C:\\Data Files\\LeafPress\\logs' | Out-Null",
    );
    expect(script.indexOf("New-Item")).toBeLessThan(
      script.indexOf("Start-Process"),
    );
  });
});
