import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/main.js";

interface ReferenceRow {
  readonly commandPath: string;
  readonly examples: string[];
  /** 这一行的原文，行里写到的 --参数要在这条命令上真的存在 */
  readonly line: string;
}

const referencePath = fileURLToPath(
  new URL("../../skills/leafpress/reference.md", import.meta.url),
);
const reference = readFileSync(referencePath, "utf8");

function referenceRows(): ReferenceRow[] {
  return reference
    .split(/\r?\n/)
    .filter((line) => line.startsWith("| `"))
    .map((line) => {
      const columns = line
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim());
      const commandPath = /^`([^`]+)`$/.exec(columns[0] ?? "")?.[1];
      const examples = Array.from(
        (columns[1] ?? "").matchAll(/`([^`]+)`/g),
        (match) => match[1],
      ).filter((example): example is string => example !== undefined);
      if (
        columns.length !== 3 ||
        commandPath === undefined ||
        examples.length === 0
      ) {
        throw new Error(`reference.md 命令表格式错误：${line}`);
      }
      return { commandPath, examples, line };
    });
}

function advertisedCommands(command: Command): string[] {
  const lines = command.helpInformation().split(/\r?\n/);
  const commandsIndex = lines.indexOf("Commands:");
  if (commandsIndex < 0) return [];
  return lines.slice(commandsIndex + 1).flatMap((line) => {
    const name = /^\s{2}([a-z][a-z0-9-]*)\b/.exec(line)?.[1];
    return name === undefined ? [] : [name];
  });
}

function findCommand(parent: Command, name: string, path: string): Command {
  const command = parent.commands.find(
    (candidate) => candidate.name() === name,
  );
  if (command === undefined)
    throw new Error(`--help 中找不到 ${path} 的上级命令 ${name}`);
  return command;
}

/** 从根命令走到 commandPath 的每一层（含根），前面几层的选项（如 --json）后面的命令也能用 */
function commandChain(root: Command, commandPath: string): Command[] {
  const chain = [root];
  for (const part of commandPath.split(" ")) {
    const parent = chain[chain.length - 1];
    if (parent === undefined) throw new Error(`空命令路径：${commandPath}`);
    chain.push(findCommand(parent, part, commandPath));
  }
  return chain;
}

function longOptions(command: Command): string[] {
  return command.options.flatMap((option) =>
    option.long === undefined ? [] : [option.long],
  );
}

function allLongOptions(command: Command): string[] {
  return [...longOptions(command), ...command.commands.flatMap(allLongOptions)];
}

/** 文字里写到的 --参数名，如 --json、--account */
function mentionedOptions(text: string): string[] {
  return Array.from(text.matchAll(/--[a-z][a-z0-9-]*/g), (match) => match[0]);
}

const rows = referenceRows();
const root = buildProgram();

describe("LeafPress skill reference 命令", () => {
  it("有命令速查项", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("列出数据分析、周报和定时任务命令，不暴露定时拉取参数", () => {
    expect(rows.map((row) => row.commandPath)).toEqual(
      expect.arrayContaining([
        "data pull",
        "data show",
        "report",
        "schedule install",
        "schedule remove",
        "schedule status",
      ]),
    );
    expect(reference).not.toContain("--scheduled");
  });

  for (const row of rows) {
    it(`${row.commandPath} 出现在对应 --help 中，示例使用 --json`, () => {
      const parts = row.commandPath.split(" ");
      const name = parts.pop();
      if (name === undefined) throw new Error(`空命令路径：${row.commandPath}`);

      let parent = root;
      for (const part of parts)
        parent = findCommand(parent, part, row.commandPath);
      expect(
        advertisedCommands(parent),
        `${row.commandPath} 的 --help`,
      ).toContain(name);

      for (const example of row.examples) {
        expect(example).toMatch(/^leafpress /);
        expect(example).toContain("--json");
        expect(example.startsWith(`leafpress ${row.commandPath}`)).toBe(true);
      }
    });

    it(`${row.commandPath} 这一行里写到的每个 --参数，命令定义里都有`, () => {
      const defined = new Set(
        commandChain(root, row.commandPath).flatMap(longOptions),
      );
      const mentioned = mentionedOptions(row.line);
      expect(mentioned.length).toBeGreaterThan(0);
      for (const option of mentioned) {
        expect(
          defined.has(option),
          `${row.commandPath} 的命令定义里没有 ${option}`,
        ).toBe(true);
      }
    });
  }

  it("表格以外的文字里写到的 --参数，至少在某条命令里有定义", () => {
    const defined = new Set(allLongOptions(root));
    const prose = reference
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("| `"))
      .join("\n");
    for (const option of mentionedOptions(prose)) {
      expect(defined.has(option), `命令定义里没有 ${option}`).toBe(true);
    }
  });

  it("data show 和 report 把命令定义里的参数写全（定时拉取用的参数不算）", () => {
    for (const commandPath of ["data show", "report"]) {
      const row = rows.find(
        (candidate) => candidate.commandPath === commandPath,
      );
      if (row === undefined) throw new Error(`缺少 ${commandPath} 这一行`);
      const command = commandChain(root, commandPath).at(-1);
      if (command === undefined) throw new Error(`空命令路径：${commandPath}`);
      for (const option of longOptions(command)) {
        expect(
          row.line.includes(option),
          `${commandPath} 这一行没写 ${option}`,
        ).toBe(true);
      }
    }
  });
});
