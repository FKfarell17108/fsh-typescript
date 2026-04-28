import readline from "readline";
import { execSync } from "child_process";
import path from "path";
import chalk from "chalk";
import { parseInput } from "./parser";
import { execute, getLastExitCode } from "./executor";
import { expandAliases } from "./aliases";
import { getCandidates, commonPrefix, showPicker } from "./completion";
import { getGitInfo, formatGitPrompt } from "./git";
import {
  loadHistoryEntries, saveHistoryEntries,
  entriesToStrings, pushEntry, HistoryEntry,
  showHistoryManager, HistoryResult,
} from "./historyManager";
import { highlight } from "./highlight";
import { loadFshrc } from "./fshrc";
import { printNeofetch, isNeofetchEnabled } from "./neofetch";
import { printFshBanner } from "./builtins";
import { showSearch } from "./search";
import { showGeneralHistory, loadGeneralHistory, logEvent } from "./generalHistory";
import { openFileOpsLogFromMain } from "./fileOpsLog";
import { loadLog } from "./fileOps";
import { loadBookmarks } from "./bookmarks";
import { showBookmarkPicker } from "./bookmarkPicker";
import { closeImagePreview } from "./preview";

// loadFshrc();
// loadLog();
// loadGeneralHistory();
// loadBookmarks();

// if (isNeofetchEnabled()) printNeofetch();

type MainProcessHandlers = {
  onExit?: () => void;
  onSigintExit?: () => void;
  onSigintAbsorb?: () => void;
};
const mainProcessHandlersKey = "__fshMainProcessHandlers__";
const mainProcessHandlers = (globalThis as any)[mainProcessHandlersKey] as MainProcessHandlers | undefined;
if (mainProcessHandlers?.onExit) process.removeListener("exit", mainProcessHandlers.onExit);
if (mainProcessHandlers?.onSigintExit) process.removeListener("SIGINT", mainProcessHandlers.onSigintExit);
if (mainProcessHandlers?.onSigintAbsorb) process.removeListener("SIGINT", mainProcessHandlers.onSigintAbsorb);

let rl: readline.Interface;
let historyEntries: HistoryEntry[] = loadHistoryEntries();
let savedHistory: string[] = entriesToStrings(historyEntries);
let tabHandlerActive = false;
let lastExitCodeForPrompt = 0;
let inputPaused = false;

let _absorbSigint = false;
export function setAbsorbSigint(v: boolean) { _absorbSigint = v; }

const onExit = () => { closeImagePreview(); };
const onSigintExit = () => { closeImagePreview(); process.exit(130); };
const onSigintAbsorb = () => {
  if (_absorbSigint) return;
};

process.on("exit", onExit);
process.on("SIGINT", onSigintExit);
process.on("SIGINT", onSigintAbsorb);

(globalThis as any)[mainProcessHandlersKey] = {
  onExit,
  onSigintExit,
  onSigintAbsorb,
} as MainProcessHandlers;

export function isInputPaused(): boolean { return inputPaused; }

export function getPrompt(): string {
  const cwd = process.cwd();
  const folder = path.basename(cwd) || "/";
  const gitInfo = getGitInfo();
  const git = gitInfo ? " " + formatGitPrompt(gitInfo) : "";
  const arrow = lastExitCodeForPrompt !== 0 ? chalk.red(" > ") : " > ";
  return `fsh/${chalk.blue(folder)}${git}${arrow}`;
}

export function setLastExitCode(code: number) {
  lastExitCodeForPrompt = code;
}

export function pauseInput() {
  inputPaused = true;
  _absorbSigint = true;
  process.stdout.removeAllListeners("resize");
  if (rl) {
    savedHistory = (rl as any).history?.slice() ?? [];
    saveHistoryEntries(historyEntries);
    rl.close();
    (rl as any) = null;
  }
  tabHandlerActive = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
}

export function resumeInput() {
  inputPaused = false;
  _absorbSigint = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
  setTimeout(() => { createRl(); prompt(); }, 50);
}

export function pauseInputForExternal() {
  inputPaused = true;
  process.stdout.removeAllListeners("resize");
  if (rl) {
    savedHistory = (rl as any).history?.slice() ?? [];
    saveHistoryEntries(historyEntries);
    rl.close();
    (rl as any) = null;
  }
  tabHandlerActive = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
}

export function resumeInputThen(cb: () => void) {
  inputPaused = false;
  _absorbSigint = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
  setTimeout(() => { createRl(); cb(); }, 50);
}

export function resumeInputAndExecute(cmdLine: string) {
  inputPaused = false;
  _absorbSigint = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
  setTimeout(() => {
    createRl();
    const statement = parseInput(cmdLine);
    execute(statement, () => { setLastExitCode(getLastExitCode()); prompt(); });
  }, 50);
}

export function reloadHistoryInRl(updated: HistoryEntry[]) {
  historyEntries = updated;
  savedHistory = entriesToStrings(updated);
  saveHistoryEntries(updated);
  if (rl) (rl as any).history = savedHistory.slice();
}

function expandEnv(val: string): string {
  let expanded = val.replace(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name1, name2) => {
    const name = name1 || name2;
    if (name === "PATH") return "$PATH";
    return process.env[name] ?? "";
  });

  if (expanded.includes("~")) {
    const home = process.env.HOME || "/";
    expanded = expanded.replace(/~(?=\/|$|:)/g, home);
  }

  return expanded;
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function ansiCursorPos(highlighted: string, rawCursor: number): number {
  let visible = 0; let i = 0;
  while (i < highlighted.length && visible < rawCursor) {
    if (highlighted[i] === "\x1b") {
      const end = highlighted.indexOf("m", i);
      if (end !== -1) { i = end + 1; continue; }
    }
    visible++; i++;
  }
  return i;
}

function setupTabIntercept() {
  const rlAny = rl as any;
  const original = rlAny._ttyWrite?.bind(rl);
  if (!original) return;

  tabHandlerActive = true;

  rlAny._ttyWrite = function (s: string, key: any) {
    if (!key) return original(s, key);

    if (tabHandlerActive && key.sequence === "\x08") {
      openGeneralHistory();
      return;
    }

    if (tabHandlerActive && key.sequence === "\x12") {
      openSearch();
      return;
    }

    if (tabHandlerActive && key.sequence === "\x02") {
      openBookmarkPicker();
      return;
    }

    if (tabHandlerActive && key.name === "tab") {
      const line: string = rlAny.line ?? "";

      if (line.trim() === "") {
        if (historyEntries.length === 0) {
          process.stdout.write("\n" + chalk.gray("  (no command history yet)") + "\n");
          rlAny._refreshLine?.();
          return;
        }
        openCommandHistoryPicker();
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

      openCompletionPicker(candidates, line, partial);
      return;
    }

    original(s, key);
    if (tabHandlerActive) rlAny._refreshLine?.();
  };

  const origRefresh = rlAny._refreshLine?.bind(rl);
  if (origRefresh) {
    rlAny._refreshLine = function () {
      const rawLine: string = rlAny.line ?? "";
      const rawCursor: number = rlAny.cursor ?? 0;
      if (rawLine.length === 0) return origRefresh();
      const highlighted = highlight(rawLine);
      const cursorInHighlight = ansiCursorPos(highlighted, rawCursor);
      rlAny.line = highlighted;
      rlAny.cursor = cursorInHighlight;
      origRefresh();
      rlAny.line = rawLine;
      rlAny.cursor = rawCursor;
    };
  }
}

function openGeneralHistory() {
  tabHandlerActive = false;
  pauseInput();
  showGeneralHistory(() => resumeInput());
}

function openBookmarkPicker() {
  tabHandlerActive = false;
  pauseInput();
  showBookmarkPicker(
    process.cwd(),
    (dir) => {
      try { process.chdir(dir); } catch { }
      resumeInput();
    },
    () => resumeInput()
  );
}

function openCommandHistoryPicker() {
  tabHandlerActive = false;
  pauseInput();
  showHistoryManager(historyEntries, (result: HistoryResult) => {
    historyEntries = result.entries;
    savedHistory = entriesToStrings(result.entries);
    saveHistoryEntries(result.entries);
    if (result.kind === "selected") {
      resumeInputWithLine(result.cmd);
    } else {
      resumeInput();
    }
  });
}

function openSearch() {
  tabHandlerActive = false;
  pauseInput();
  showSearch(
    historyEntries,
    (value) => resumeInputWithLine(value),
    () => resumeInput()
  );
}

function openCompletionPicker(candidates: string[], line: string, partial: string) {
  tabHandlerActive = false;
  pauseInput();
  showPicker(
    candidates,
    (chosen) => resumeInputWithLine(line.slice(0, line.length - partial.length) + chosen),
    () => resumeInputWithLine(line),
    () => {
      resumeInput();
      setTimeout(() => {
        pauseInput();
        showHistoryManager(historyEntries, (result: HistoryResult) => {
          historyEntries = result.entries;
          savedHistory = entriesToStrings(result.entries);
          saveHistoryEntries(result.entries);
          if (result.kind === "selected") {
            resumeInputWithLine(result.cmd);
          } else {
            resumeInput();
          }
        });
      }, 60);
    }
  );
}

export function resumeInputWithLine(restoreLine: string) {
  inputPaused = false;
  _absorbSigint = false;
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
  setTimeout(() => { createRl(); promptWithLine(restoreLine); }, 50);
}

function createRl() {
  if (rl) {
    try {
      savedHistory = (rl as any).history?.slice() ?? [];
      saveHistoryEntries(historyEntries);
      rl.close();
    } catch { }
    (rl as any) = null;
  }
  try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch { }
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    terminal: true, historySize: 500,
  });
  if (savedHistory.length > 0) (rl as any).history = savedHistory.slice();
  rl.on("SIGINT", () => {
    lastExitCodeForPrompt = 0;
    process.stdout.write("\n");
    createRl();
    prompt();
  });
  setupTabIntercept();
}

function setLine(newLine: string) {
  const rlAny = rl as any;
  rlAny.line = newLine;
  rlAny.cursor = newLine.length;
  rlAny._refreshLine?.();
}

export function startPrompt() { createRl(); prompt(); }

function prompt() {
  tabHandlerActive = true;
  rl.question(getPrompt(), (input) => {
    tabHandlerActive = false;
    const cleanInput = input.trim();
    if (!cleanInput) return prompt();
    const rawInput = stripAnsi(cleanInput);
    historyEntries = pushEntry(historyEntries, rawInput);
    savedHistory = entriesToStrings(historyEntries);
    saveHistoryEntries(historyEntries);
    logEvent("command", rawInput, "");
    const expanded = expandAliases(rawInput);
    const statement = parseInput(expanded);
    execute(statement, () => { setLastExitCode(getLastExitCode()); prompt(); });
  });
}

function promptWithLine(prefill: string) {
  tabHandlerActive = true;
  rl.question(getPrompt(), (input) => {
    tabHandlerActive = false;
    const cleanInput = input.trim();
    if (!cleanInput) return prompt();
    const rawInput = stripAnsi(cleanInput);
    historyEntries = pushEntry(historyEntries, rawInput);
    savedHistory = entriesToStrings(historyEntries);
    saveHistoryEntries(historyEntries);
    logEvent("command", rawInput, "");
    const expanded = expandAliases(rawInput);
    const statement = parseInput(expanded);
    execute(statement, () => { setLastExitCode(getLastExitCode()); prompt(); });
  });
  if (prefill) setTimeout(() => setLine(prefill), 10);
}

function isStartedFromOtherShell(): boolean {
  try {
    const parent = execSync(`ps -p ${process.ppid} -o comm=`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const shells = ["bash", "zsh", "fish", "sh", "dash", "ksh"];
    if (shells.includes(parent)) return true;
  } catch { }
  
  const shell = process.env.SHELL || "";
  if (shell.includes("bash") || shell.includes("zsh") || shell.includes("fish")) {
    if (process.env.SHLVL && parseInt(process.env.SHLVL, 10) >= 1) return true;
  }
  return false;
}

function syncEnvironment() {
  if (process.platform === "win32") return;

  try {
    const shell = process.env.SHELL || "bash";
    const output = execSync(`${shell} -l -c 'env'`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 2000
    });

    const lines = output.split("\n");
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq !== -1) {
        const key = line.slice(0, eq);
        const val = line.slice(eq + 1).trim();
        
        if (key === "PATH") {
          const currentPath = process.env.PATH ?? "";
          const shellPath = val;
          const combined = (shellPath + ":" + currentPath).split(":").filter(Boolean);
          process.env.PATH = Array.from(new Set(combined)).join(":");
        } else if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
  }
}

if (require.main === module) {
  const fromOtherShell = isStartedFromOtherShell();

  syncEnvironment();

  loadFshrc();
  loadLog();
  loadGeneralHistory();
  loadBookmarks();

  if (fromOtherShell) {
    printFshBanner();
  } else if (isNeofetchEnabled()) {
    printNeofetch();
  }

  process.env.FSH_IN_SHELL = "true";
  startPrompt();
}