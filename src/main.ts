import readline from "readline";
import path from "path";
import chalk from "chalk";
import { parseInput } from "./parser";
import { execute } from "./executor";
import { expandAliases } from "./aliases";
import { getCandidates, commonPrefix, showPicker } from "./completion";
import { getGitInfo, formatGitPrompt } from "./git";


let rl: readline.Interface;
let savedHistory: string[] = [];
let tabHandlerActive = false;

export function getPrompt(): string {
  const cwd = process.cwd();
  const folder = path.basename(cwd) || "/";

  const gitInfo = getGitInfo();
  const git = gitInfo ? " " + formatGitPrompt(gitInfo) : "";

  return `fsh/${chalk.blue(folder)}${git} > `;
}

export function pauseInput() {
  if (rl) {
    savedHistory = (rl as any).history?.slice() ?? [];
    rl.close();
  }
  tabHandlerActive = false;
}

export function resumeInput() {
  setTimeout(() => {
    createRl();
    prompt();
  }, 50);
}

// ─── Tab intercept via _ttyWrite override ────────────────────────────────────

function setupTabIntercept() {
  const rlAny = rl as any;
  const original = rlAny._ttyWrite?.bind(rl);
  if (!original) return;

  tabHandlerActive = true;

  rlAny._ttyWrite = function (s: string, key: any) {
    if (!key) return original(s, key);

    // Tab handling
    if (tabHandlerActive && key.name === "tab") {
      const line: string = rlAny.line ?? "";

      if (line.trim() === "") {
        const history: string[] = rlAny.history ?? [];
        if (history.length === 0) {
          process.stdout.write("\n" + chalk.gray("  (no command history yet)") + "\n");
          rlAny._refreshLine?.();
          return;
        }
        openPicker(history, line, "");
        return;
      }

      const { candidates, partial } = getCandidates(line);
      if (candidates.length === 0) return;

      if (candidates.length === 1) {
        setLine(line.slice(0, line.length - partial.length) + candidates[0]);
        return;
      }

      const prefix = commonPrefix(candidates);
      if (prefix.length > partial.length) {
        setLine(line.slice(0, line.length - partial.length) + prefix);
        return;
      }

      openPicker(candidates, line, partial);
      return;
    }

    return original(s, key);
  };
}

function openPicker(candidates: string[], line: string, partial: string) {
  tabHandlerActive = false;
  pauseInput();

  // Render picker below the current prompt line (no newline — cursor stays on prompt row)
  // Save cursor pos, move to next line for picker, restore after
  showPicker(
    candidates,
    (chosen) => {
      const newLine = line.slice(0, line.length - partial.length) + chosen;
      resumeInputWithLine(newLine);
    },
    () => {
      resumeInputWithLine(line);
    }
  );
}

function resumeInputWithLine(restoreLine: string) {
  setTimeout(() => {
    createRl();
    promptWithLine(restoreLine);
  }, 50);
}

// ─── rl management ───────────────────────────────────────────────────────────

function createRl() {
  if (rl) {
    savedHistory = (rl as any).history?.slice() ?? [];
    rl.close();
  }

  process.stdin.setEncoding("utf8");
  process.stdin.resume();

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 500,
  });

  if (savedHistory.length > 0) {
    (rl as any).history = savedHistory.slice();
  }

  rl.on("SIGINT", () => {
    process.stdout.write("\n");
    process.exit(0);
  });

  setupTabIntercept();
}

function setLine(newLine: string) {
  const rlAny = rl as any;
  rlAny.line = newLine;
  rlAny.cursor = newLine.length;
  rlAny._refreshLine?.();
}

// ─── Prompting ────────────────────────────────────────────────────────────────

export function startPrompt() {
  createRl();
  prompt();
}

function prompt() {
  tabHandlerActive = true;
  rl.question(getPrompt(), (input) => {
    tabHandlerActive = false;
    const cleanInput = input.trim();
    if (!cleanInput) return prompt();

    const expanded = expandAliases(cleanInput);
    const statement = parseInput(expanded);

    execute(statement, () => prompt());
  });
}

function promptWithLine(prefill: string) {
  tabHandlerActive = true;
  rl.question(getPrompt(), (input) => {
    tabHandlerActive = false;
    const cleanInput = input.trim();
    if (!cleanInput) return prompt();

    const expanded = expandAliases(cleanInput);
    const statement = parseInput(expanded);

    execute(statement, () => prompt());
  });

  if (prefill) {
    setTimeout(() => setLine(prefill), 10);
  }
}

startPrompt();