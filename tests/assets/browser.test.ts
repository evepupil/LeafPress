import { describe, expect, it } from "vitest";

import { locateEdge } from "../../src/assets/browser.js";

describe("locateEdge：浏览器定位", () => {
  it("优先使用配置路径", () => {
    const checked: string[] = [];
    const path = locateEdge({
      configuredPath: "C:/custom/edge.exe",
      platform: "win32",
      env: { "ProgramFiles(x86)": "C:/Program Files (x86)" },
      exists: (candidate) => {
        checked.push(candidate);
        return true;
      },
    });
    expect(path).toBe("C:/custom/edge.exe");
    expect(checked).toEqual(["C:/custom/edge.exe"]);
  });

  it("按顺序尝试 Windows 的三个安装目录", () => {
    const checked: string[] = [];
    const expected = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Users\\test\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    expect(
      locateEdge({
        platform: "win32",
        env: {
          "ProgramFiles(x86)": "C:\\Program Files (x86)",
          ProgramFiles: "C:\\Program Files",
          LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
        },
        exists: (candidate) => {
          checked.push(candidate);
          return candidate === expected[2];
        },
      }),
    ).toBe(expected[2]);
    expect(checked).toEqual(expected);
  });

  it("定位 macOS 和 Linux 的固定路径", () => {
    const macPath =
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    expect(
      locateEdge({
        platform: "darwin",
        env: {},
        exists: (candidate) => candidate === macPath,
      }),
    ).toBe(macPath);

    expect(
      locateEdge({
        platform: "linux",
        env: {},
        exists: (candidate) => candidate.endsWith("microsoft-edge-stable"),
      }),
    ).toBe("/usr/bin/microsoft-edge-stable");
  });

  it("没有候选路径存在时返回 undefined", () => {
    expect(
      locateEdge({ platform: "linux", env: {}, exists: () => false }),
    ).toBeUndefined();
  });
});
