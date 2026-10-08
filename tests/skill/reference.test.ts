import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/cli/main.js";

interface ReferenceRow {
  readonly commandPath: string;
  readonly examples: string[];
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
      return { commandPath, examples };
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

const rows = referenceRows();
const root = buildProgram();

describe("LeafPress skill reference 命令", () => {
  it("有命令速查项", () => {
    expect(rows.length).toBeGreaterThan(0);
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
  }
});
