import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { HomePaths } from "../../src/config/home.js";
import { homePaths } from "../../src/config/home.js";
import {
  listTaskFiles,
  missingFiles,
  MIRROR_FILES,
  taskFolderPath,
  writeTaskMirror,
  type TaskMirror,
} from "../../src/files/task-folder.js";
import { assertSafeId } from "../../src/files/ids.js";
import { LeafPressError } from "../../src/shared/errors.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makePaths(): Promise<HomePaths> {
  const home = await mkdtemp(join(tmpdir(), "leafpress-files-task-"));
  dirs.push(home);
  return homePaths(home);
}

function mirror(overrides: Partial<TaskMirror> = {}): TaskMirror {
  return {
    workId: "work-12",
    context: "完整说明",
    state: {
      id: "work-12",
      title: "测试作品",
      accountId: "zhihu-2",
      platform: "zhihu",
      status: "waiting",
      statusText: "等你处理",
      step: 2,
      stepCount: 4,
      workflowId: "zhihu-write",
      updatedAt: "2026-10-08T09:30:00+08:00",
    },
    ask: "请确认发布链接",
    feedback: [
      {
        at: "2026-10-08T09:31:59+08:00",
        step: 2,
        stepName: "你去发布",
        text: "发布完成，链接已补。",
      },
      {
        at: "2026-10-08T09:33:59+08:00",
        step: 3,
        stepName: "复核",
        text: "第一行\n第二行",
      },
    ],
    log: [
      { at: "2026-10-08T09:32:59+08:00", text: "状态已更新\n补充说明" },
      { at: "2026-10-08T09:34:59+08:00", text: "第二条记录" },
    ],
    ...overrides,
  };
}

describe("任务文件夹镜像", () => {
  it("创建文件夹并逐字写五份说明文件", async () => {
    const paths = await makePaths();
    writeTaskMirror(paths, mirror());
    const folder = taskFolderPath(paths, "work-12");
    expect((await readdir(folder)).sort()).toEqual([...MIRROR_FILES].sort());
    expect(await readFile(join(folder, "作品.md"), "utf8")).toBe("完整说明\n");
    expect(await readFile(join(folder, "状态.json"), "utf8")).toBe(
      `${JSON.stringify(mirror().state, null, 2)}\n`,
    );
    expect(await readFile(join(folder, "要你做的事.md"), "utf8")).toBe(
      "请确认发布链接\n",
    );
    expect(await readFile(join(folder, "你的反馈.md"), "utf8")).toBe(
      "## 2026-10-08 09:31（你去发布）\n\n发布完成，链接已补。\n\n## 2026-10-08 09:33（复核）\n\n第一行\n第二行\n",
    );
    expect(await readFile(join(folder, "记录.log"), "utf8")).toBe(
      "2026-10-08 09:32  状态已更新 补充说明\n2026-10-08 09:34  第二条记录\n",
    );
  });

  it("一个镜像文件失败后仍尝试其余文件并汇总报告", async () => {
    const paths = await makePaths();
    const folder = taskFolderPath(paths, "work-12");
    await mkdir(join(folder, MIRROR_FILES[0]), { recursive: true });

    try {
      writeTaskMirror(paths, mirror());
      expect.unreachable("应汇总写入失败");
    } catch (error) {
      const failure = error as LeafPressError;
      expect(failure.code).toBe("STORE_FAILED");
      expect(failure.message).toContain(MIRROR_FILES[0]);
    }
    expect(await readFile(join(folder, MIRROR_FILES[1]), "utf8")).toContain(
      '"id": "work-12"',
    );
    expect(await readFile(join(folder, MIRROR_FILES[2]), "utf8")).toBe(
      "请确认发布链接\n",
    );
    expect(await readFile(join(folder, MIRROR_FILES[3]), "utf8")).toContain(
      "第二行",
    );
    expect(await readFile(join(folder, MIRROR_FILES[4]), "utf8")).toContain(
      "第二条记录",
    );
  });

  it("内容没变时不更新修改时间；ask 和反馈为空时删除对应文件", async () => {
    const paths = await makePaths();
    writeTaskMirror(paths, mirror());
    const folder = taskFolderPath(paths, "work-12");
    const unchanged = join(folder, "作品.md");
    const fixedTime = new Date("2025-01-01T00:00:00Z");
    await utimes(unchanged, fixedTime, fixedTime);
    const before = statSync(unchanged).mtimeMs;
    writeTaskMirror(paths, mirror());
    expect(statSync(unchanged).mtimeMs).toBe(before);

    writeTaskMirror(paths, mirror({ ask: undefined, feedback: [], log: [] }));
    expect((await readdir(folder)).sort()).toEqual([
      "作品.md",
      "状态.json",
      "记录.log",
    ]);
    expect(await readFile(join(folder, "记录.log"), "utf8")).toBe("");
  });

  it("递归列出产出文件，排除根说明文件和点开头路径并排序", async () => {
    const paths = await makePaths();
    const folder = taskFolderPath(paths, "work-12");
    await mkdir(join(folder, "nested", ".hidden-dir"), { recursive: true });
    await writeFile(join(folder, "稿子.md"), "draft", "utf8");
    await writeFile(join(folder, "作品.md"), "mirror", "utf8");
    await writeFile(join(folder, ".hidden"), "hidden", "utf8");
    await writeFile(join(folder, "nested", "page.html"), "page", "utf8");
    await writeFile(join(folder, "nested", "状态.json"), "nested data", "utf8");
    await writeFile(
      join(folder, "nested", ".hidden-dir", "ignored.txt"),
      "hidden",
      "utf8",
    );
    expect(listTaskFiles(paths, "work-12")).toEqual([
      "nested/page.html",
      "nested/状态.json",
      "稿子.md",
    ]);
    expect(listTaskFiles(paths, "work-missing")).toEqual([]);
    expect(
      missingFiles(paths, "work-12", [
        "稿子.md",
        "nested/page.html",
        "gone.md",
        "../outside",
      ]),
    ).toEqual(["gone.md", "../outside"]);
  });

  it("拒绝可拼出数据目录外路径的作品和账号编号", () => {
    for (const id of ["../x", "a/b", "", "Upper"]) {
      expect(() => assertSafeId(id)).toThrowError(LeafPressError);
    }
    expect(() => taskFolderPath(homePaths("/tmp/home"), "../x")).toThrowError(
      LeafPressError,
    );
    expect(() => assertSafeId("work-12")).not.toThrow();
  });
});
