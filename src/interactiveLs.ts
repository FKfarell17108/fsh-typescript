import fs from "fs";
import path from "path";
import chalk from "chalk";

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
        try {
          process.chdir(path.join(cwd, selected.name));
        } catch {}
      }
      return exit();
    }

    let idx = selectedIndex;
    if (key === "\u001b[A") idx -= perRow;
    if (key === "\u001b[B") idx += perRow;
    if (key === "\u001b[C") idx += 1;
    if (key === "\u001b[D") idx -= 1;
    if (key === "\u001b[H") idx = 0;
    if (key === "\u001b[F") idx = entries.length - 1;

    idx = Math.max(0, Math.min(entries.length - 1, idx));

    if (idx !== selectedIndex) {
      selectedIndex = idx;
      render();
    }
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  process.stdout.write("\x1b[?25l");

  stdin.on("data", onKey);

  lastRenderedLines = 0;
  render();
}