import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execFileSync } from "child_process";

// Editors to check, in priority order
const EDITOR_CANDIDATES = [
  "nvim", "vim", "vi", "nano", "emacs", "micro", "hx", "helix", "code", "gedit",
];

function getInstalledEditors(): string[] {
  const installed: string[] = [];
  for (const editor of EDITOR_CANDIDATES) {
    try {
      execFileSync("which", [editor], { stdio: "ignore" });
      installed.push(editor);
    } catch {}
  }
  return installed;
}

// Set when user picks a file+editor from ls — builtins reads this after onExit
export let pendingOpen: { editor: string; file: string } | null = null;
export function clearPendingOpen() { pendingOpen = null; }

export function interactiveLs(onExit: () => void) {
  const cwd = process.cwd();

  let entries: { name: string; isDir: boolean }[] = [];

  try {
    entries = fs.readdirSync(cwd).map((name) => {
      const full = path.join(cwd, name);
      let isDir = false;
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {}
      return { name, isDir };
    });
  } catch {
    console.log(`ls: cannot read directory`);
    return onExit();
  }

  entries.sort(
    (a, b) =>
      Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)
  );

  if (!process.stdin.isTTY) {
    console.log(entries.map((e) => e.name).join("  "));
    return onExit();
  }

  if (entries.length === 0) {
    console.log("(empty directory)");
    return onExit();
  }

  let selectedIndex = 0;
  const stdin = process.stdin;

  // Fixed layout — computed once, stable across renders
  const maxNameLen = Math.max(...entries.map((e) => e.name.length));
  const COL_PAD = 2;
  const COL_WIDTH = maxNameLen + COL_PAD;

  function getPerRow() {
    const cols = process.stdout.columns || 80;
    return Math.max(1, Math.floor(cols / COL_WIDTH));
  }

  // Total rendered lines (hint + blank + grid rows)
  let lastRenderedLines = 0;

  function render() {
    const perRow = getPerRow();
    const totalRows = Math.ceil(entries.length / perRow);

    // Build entire frame as one string to avoid flicker
    let frame = "";

    // Move cursor up to start of previous render and overwrite
    if (lastRenderedLines > 0) {
      frame += `\x1b[${lastRenderedLines}A\r`;
    }

    // Hint bar
    const key = (k: string) => chalk.bgGray.white.bold(` ${k} `);
    const g = chalk.gray;
    const hintLine =
      " " +
      key("↑↓←→") + g(" move  ") +
      key("enter") + g(" cd  ") +
      key("q") + g("/") + key("esc") + g(" quit");

    frame += hintLine + "\x1b[K\n\x1b[K\n";

    // Grid rows — each cell is exactly COL_WIDTH chars wide
    for (let row = 0; row < totalRows; row++) {
      let line = " "; // left margin
      for (let col = 0; col < perRow; col++) {
        const i = row * perRow + col;
        if (i >= entries.length) break;

        const { name, isDir } = entries[i];
        const isSelected = i === selectedIndex;
        const isHidden = name.startsWith(".");
        const padded = name.padEnd(COL_WIDTH, " ");

        let cell: string;
        if (isSelected) {
          cell = chalk.bgWhite.black.bold(padded);
        } else if (isDir) {
          cell = isHidden ? chalk.cyan(padded) : chalk.blue.bold(padded);
        } else {
          cell = isHidden ? chalk.gray(padded) : chalk.white(padded);
        }

        line += cell;
      }
      frame += line + "\x1b[K\n";
    }

    lastRenderedLines = 2 + totalRows; // hint + blank + grid

    // Single write — no intermediate blank state = no flicker
    process.stdout.write(frame);
  }

  function cleanup() {
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.removeAllListeners("data");
    stdin.removeAllListeners("keypress");
    process.stdout.write("\x1b[?25h");
  }

  function exit() {
    if (lastRenderedLines > 0) {
      process.stdout.write(`\x1b[${lastRenderedLines}A\r\x1b[J`);
    }
    cleanup();
    setTimeout(onExit, 50);
  }

  function onKey(key: string) {
    const perRow = getPerRow();

    if (key === "\u0003" || key === "q" || key === "\u001b") return exit();

    if (key === "\r") {
      const selected = entries[selectedIndex];
      if (selected.isDir) {
        try { process.chdir(path.join(cwd, selected.name)); } catch {}
        return exit();
      } else {
        // File selected — show editor picker
        return showEditorPicker(path.join(cwd, selected.name));
      }
    }

    let idx = selectedIndex;
    if (key === "\u001b[A") idx -= perRow;
    if (key === "\u001b[B") idx += perRow;
    if (key === "\u001b[C") idx += 1;
    if (key === "\u001b[D") idx -= 1;
    if (key === "\u001b[H") idx = 0;
    if (key === "\u001b[F") idx = entries.length - 1;

    idx = Math.max(0, Math.min(entries.length - 1, idx));
    if (idx !== selectedIndex) { selectedIndex = idx; render(); }
  }

  function showEditorPicker(filePath: string) {
    const editors = getInstalledEditors();

    if (editors.length === 0) {
      // No editors found — just exit
      return exit();
    }

    if (editors.length === 1) {
      // Only one editor — open directly
      cleanup();
      if (lastRenderedLines > 0) {
        process.stdout.write(`\x1b[${lastRenderedLines}A\r\x1b[J`);
      }
      setTimeout(() => {
        onExit();
        // Signal to open file — pass via env so executor can pick it up
        // Actually spawn directly here via execFileSync won't work for TUI editors
        // Instead, write a small helper: set env var and let caller handle it
      }, 10);
      return;
    }

    // Multiple editors — render inline picker below current ls UI
    const COL_WIDTH = Math.max(...editors.map((e) => e.length)) + 2;

    function getPerRowE() {
      return Math.max(1, Math.floor((process.stdout.columns || 80) / COL_WIDTH));
    }

    let selIdx = 0;
    let pickerLines = 0;

    function renderEditorPicker() {
      const perRow = getPerRowE();
      const totalRows = Math.ceil(editors.length / perRow);
      let frame = "";

      if (pickerLines > 0) {
        frame += `\x1b[${pickerLines}A\r\x1b[J`;
      }

      const fname = chalk.white(path.basename(filePath));
      const k = (s: string) => chalk.bgGray.white.bold(` ${s} `);
      frame += `\n ${chalk.gray("open")} ${fname} ${chalk.gray("with:")}\n\x1b[K\n`;

      for (let row = 0; row < totalRows; row++) {
        let line = " ";
        for (let col = 0; col < perRow; col++) {
          const i = row * perRow + col;
          if (i >= editors.length) break;
          const name = editors[i].padEnd(COL_WIDTH, " ");
          line += i === selIdx
            ? chalk.bgWhite.black.bold(name)
            : chalk.cyan(name);
        }
        frame += line + "\x1b[K\n";
      }

      pickerLines = 3 + totalRows;
      process.stdout.write(frame);
    }

    function clearEditorPicker() {
      if (pickerLines > 0) {
        process.stdout.write(`\x1b[${pickerLines}A\r\x1b[J`);
        pickerLines = 0;
      }
    }

    function onEditorKey(key: string) {
      const perRow = getPerRowE();

      if (key === "\u0003" || key === "\u001b") {
        // Cancel — go back to ls
        stdin.removeListener("data", onEditorKey);
        clearEditorPicker();
        stdin.on("data", onKey);
        return;
      }

      if (key === "\r") {
        const chosen = editors[selIdx];
        stdin.removeListener("data", onEditorKey);
        clearEditorPicker();
        cleanup();
        if (lastRenderedLines > 0) {
          process.stdout.write(`\x1b[${lastRenderedLines}A\r\x1b[J`);
        }
        process.stdout.write("\x1b[?25h");
        // Pass chosen editor + file back to shell via onExit callback
        setTimeout(() => {
          // Store pending open so main can execute it
          pendingOpen = { editor: chosen, file: filePath };
          onExit();
        }, 20);
        return;
      }

      let i = selIdx;
      if (key === "\u001b[A") i -= perRow;
      if (key === "\u001b[B") i += perRow;
      if (key === "\u001b[C") i += 1;
      if (key === "\u001b[D") i -= 1;
      i = Math.max(0, Math.min(editors.length - 1, i));
      if (i !== selIdx) { selIdx = i; renderEditorPicker(); }
    }

    stdin.removeListener("data", onKey);
    stdin.on("data", onEditorKey);
    renderEditorPicker();
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  process.stdout.write("\x1b[?25l");

  stdin.on("data", onKey);

  lastRenderedLines = 0;
  render();
}