import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execFileSync } from "child_process";
import { moveToTrash } from "./trash";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, drawNavbar, drawFooter, kb, enterAlt, exitAlt, clearScreen } from "./tui";

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

export let pendingOpen: { editor: string; file: string } | null = null;
export function clearPendingOpen() { pendingOpen = null; }

export function interactiveLs(onExit: () => void) {
  const cwd = process.cwd();
  let entries: { name: string; isDir: boolean }[] = [];

  try {
    entries = fs.readdirSync(cwd).map((name) => {
      const full = path.join(cwd, name);
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch {}
      return { name, isDir };
    });
  } catch {
    console.log("ls: cannot read directory");
    return onExit();
  }

  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));

  if (!process.stdin.isTTY) {
    console.log(entries.map((e) => e.name).join("  "));
    return onExit();
  }

  if (entries.length === 0) {
    console.log("(empty directory)");
    return onExit();
  }

  const stdin   = process.stdin;
  let selIdx    = 0;
  let scrollTop = 0;

  function colWidth(): number {
    const max = Math.max(...entries.map((e) => e.name.length));
    return max + 2;
  }

  function perRow(): number {
    return Math.max(1, Math.floor(C() / colWidth()));
  }

  function totalContentRows(): number {
    return Math.ceil(entries.length / perRow());
  }

  function vis(): number {
    return Math.max(1, R() - NAVBAR_ROWS - FOOTER_ROWS);
  }

  function adjustScroll() {
    const pr  = perRow();
    const row = Math.floor(selIdx / pr);
    const v   = vis();
    if (row < scrollTop) scrollTop = row;
    if (row >= scrollTop + v) scrollTop = row - v + 1;
  }

  function navRight(): string {
    const tr = totalContentRows();
    const pr = perRow();
    return `${tr}R × ${pr}C`;
  }

  function statLeft(): string {
    const dirs  = entries.filter((e) => e.isDir).length;
    const files = entries.length - dirs;
    const parts: string[] = [];
    if (dirs  > 0) parts.push(`${dirs} ${dirs  === 1 ? "dir"  : "dirs"}`);
    if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
    return parts.join("  ");
  }

  function buildNavHints(): string[] {
    const pr         = perRow();
    const tr         = totalContentRows();
    const v          = vis();
    const scrollInfo = tr > v ? chalk.dim(` [row ${Math.floor(selIdx / pr) + 1}/${tr}]`) : "";

    return [
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("d") + chalk.gray(" delete  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("d") + chalk.gray(" del  ")    + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ")                                     + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ")                                     + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ")                                                                           + kb("esc") + chalk.gray(" quit"),
    ];
  }

  function drawContent() {
    const pr  = perRow();
    const cw  = colWidth();
    const v   = vis();
    let out   = "";

    for (let row = 0; row < v; row++) {
      out += at(NAVBAR_ROWS + 1 + row, 1) + clr();
      const fileRow = scrollTop + row;
      let line = " ";
      for (let col = 0; col < pr; col++) {
        const i = fileRow * pr + col;
        if (i >= entries.length) break;
        const { name, isDir } = entries[i];
        const isSelected = i === selIdx;
        const isHidden   = name.startsWith(".");
        const padded     = name.padEnd(cw, " ");

        if (isSelected) {
          line += chalk.bgWhite.black.bold(padded);
        } else if (isDir) {
          line += isHidden ? chalk.cyan(padded) : chalk.blue.bold(padded);
        } else {
          line += isHidden ? chalk.gray(padded) : chalk.white(padded);
        }
      }
      out += line;
    }

    w(out);
    drawFooter(NAVBAR_ROWS + 1 + v, totalContentRows(), scrollTop, v, statLeft());
  }

  function render() {
    drawNavbar(buildNavHints(), navRight());
    drawContent();
  }

  function fullRedraw() {
    clearScreen();
    adjustScroll();
    render();
  }

  function cleanup() {
    process.stdout.removeListener("resize", onResize);
    stdin.removeAllListeners("data");
    if (stdin.isTTY) stdin.setRawMode(false);
    exitAlt();
  }

  function exit() {
    cleanup();
    setTimeout(onExit, 50);
  }

  function onResize() { fullRedraw(); }

  function showDeleteConfirm(entryName: string, isDir: boolean) {
    const full = path.join(cwd, entryName);

    function buildDeleteNavHints(): string[] {
      return [
        kb("y") + chalk.gray(" confirm  ") + kb("n") + chalk.gray(" / ") + kb("esc") + chalk.gray(" cancel"),
        kb("y") + chalk.gray(" yes  ")                                    + kb("esc") + chalk.gray(" no"),
      ];
    }

    function drawConfirmContent() {
      const cols  = C();
      const avail = R() - NAVBAR_ROWS;
      let out     = "";
      let lineNum = 0;

      function line(content: string) {
        if (lineNum >= avail) return;
        out += at(NAVBAR_ROWS + 1 + lineNum, 1) + clr() + content;
        lineNum++;
      }

      line(chalk.bold((isDir ? "  dir" : " file") + "  " + entryName));
      line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));

      if (isDir) {
        try {
          const children = fs.readdirSync(full, { withFileTypes: true });
          if (children.length === 0) {
            line(chalk.gray("  (empty directory)"));
          } else {
            for (const c of children.slice(0, avail - 6)) {
              line((c.isDirectory() ? chalk.blue("  ▸ ") : chalk.gray("    ")) + chalk.white(c.name));
            }
            if (children.length > avail - 6) {
              line(chalk.gray(`  ... and ${children.length - (avail - 6)} more`));
            }
          }
        } catch {
          line(chalk.red("  cannot read directory"));
        }
      } else {
        try {
          const fileLines = fs.readFileSync(full, "utf8").split("\n");
          for (const fl of fileLines.slice(0, avail - 6)) {
            const d = fl.length > cols - 4 ? fl.slice(0, cols - 5) + "…" : fl;
            line(chalk.white("  " + d));
          }
          if (fileLines.length > avail - 6) {
            line(chalk.gray(`  ... ${fileLines.length - (avail - 6)} more lines`));
          }
        } catch {
          line(chalk.gray("  (binary file)"));
        }
      }

      for (let i = lineNum; i < avail - 2; i++) {
        out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
        lineNum++;
      }

      out += at(R() - 1, 1) + clr() + chalk.dim("─".repeat(Math.min(cols - 2, 60)));
      out += at(R(),     1) + clr() +
        "  " + chalk.yellow.bold("Move to Trash") + ": " + chalk.white(entryName) +
        (isDir ? chalk.gray(" and all its contents") : "") + "?";

      w(out);
    }

    stdin.removeListener("data", onKey);

    function onConfirmKey(k: string) {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirmKey);
        try {
          moveToTrash(full);
          entries = entries.filter((e) => e.name !== entryName);
        } catch (err: any) {
          w(at(R(), 1) + clr() + chalk.red("  Error: " + err.message));
          setTimeout(() => { stdin.on("data", onKey); fullRedraw(); }, 1500);
          return;
        }
        if (entries.length === 0) return exit();
        selIdx = Math.min(selIdx, entries.length - 1);
        stdin.on("data", onKey);
        fullRedraw();
        return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirmKey);
        stdin.on("data", onKey);
        fullRedraw();
      }
    }

    stdin.on("data", onConfirmKey);
    clearScreen();
    drawNavbar(buildDeleteNavHints(), navRight());
    drawConfirmContent();
  }

  function onKey(k: string) {
    const pr = perRow();

    if (k === "\u0003" || k === "\u001b") return exit();

    if (k === "d" || k === "D") {
      return showDeleteConfirm(entries[selIdx].name, entries[selIdx].isDir);
    }

    if (k === "\r") {
      const selected = entries[selIdx];
      if (selected.isDir) {
        try { process.chdir(path.join(cwd, selected.name)); } catch {}
        return exit();
      }
      return showEditorPicker(path.join(cwd, selected.name));
    }

    let idx = selIdx;
    if (k === "\u001b[A") idx -= pr;
    if (k === "\u001b[B") idx += pr;
    if (k === "\u001b[C") idx += 1;
    if (k === "\u001b[D") idx -= 1;
    if (k === "\u001b[H") idx = 0;
    if (k === "\u001b[F") idx = entries.length - 1;

    idx = Math.max(0, Math.min(entries.length - 1, idx));
    if (idx !== selIdx) {
      selIdx = idx;
      adjustScroll();
      render();
    }
  }

  function showEditorPicker(filePath: string) {
    const editors = getInstalledEditors();
    if (editors.length === 0) return exit();

    if (editors.length === 1) {
      cleanup();
      setTimeout(() => { pendingOpen = { editor: editors[0], file: filePath }; onExit(); }, 20);
      return;
    }

    const EW       = Math.max(...editors.map((e) => e.length)) + 2;
    let eSelIdx    = 0;
    let eScrollTop = 0;

    function ePerRow(): number   { return Math.max(1, Math.floor(C() / EW)); }
    function eTotalRows(): number { return Math.ceil(editors.length / ePerRow()); }
    function eVis(): number      { return Math.max(1, R() - NAVBAR_ROWS - 3 - FOOTER_ROWS); }

    function eAdjustScroll() {
      const pr  = ePerRow();
      const row = Math.floor(eSelIdx / pr);
      const v   = eVis();
      if (row < eScrollTop) eScrollTop = row;
      if (row >= eScrollTop + v) eScrollTop = row - v + 1;
    }

    function eNavRight(): string {
      return `${eTotalRows()}R × ${ePerRow()}C`;
    }

    function eStatLeft(): string {
      return `${editors.length} ${editors.length === 1 ? "editor" : "editors"}`;
    }

    function buildEditorNavHints(): string[] {
      return [
        kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + kb("esc") + chalk.gray(" back"),
        kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + kb("esc") + chalk.gray(" back"),
        kb("↑↓")   + chalk.gray(" move  ")                                          + kb("esc") + chalk.gray(" back"),
      ];
    }

    function drawEditorContent() {
      const pr    = ePerRow();
      const v     = eVis();
      const fname = chalk.white(path.basename(filePath));
      let out = "";

      out += at(NAVBAR_ROWS + 1, 1) + clr() + " " + chalk.gray("open") + " " + fname + " " + chalk.gray("with:");
      out += at(NAVBAR_ROWS + 2, 1) + clr();
      out += at(NAVBAR_ROWS + 3, 1) + clr();

      for (let row = 0; row < v; row++) {
        out += at(NAVBAR_ROWS + 4 + row, 1) + clr();
        const fileRow = eScrollTop + row;
        let line = " ";
        for (let col = 0; col < pr; col++) {
          const i = fileRow * pr + col;
          if (i >= editors.length) break;
          const name = editors[i].padEnd(EW, " ");
          line += i === eSelIdx ? chalk.bgWhite.black.bold(name) : chalk.cyan(name);
        }
        out += line;
      }

      w(out);
      drawFooter(NAVBAR_ROWS + 4 + v, eTotalRows(), eScrollTop, v, eStatLeft());
    }

    function renderEditor() {
      drawNavbar(buildEditorNavHints(), eNavRight());
      drawEditorContent();
    }

    function onEditorKey(k: string) {
      const pr = ePerRow();
      if (k === "\u0003" || k === "\u001b") {
        stdin.removeListener("data", onEditorKey);
        stdin.on("data", onKey);
        fullRedraw();
        return;
      }
      if (k === "\r") {
        const chosen = editors[eSelIdx];
        stdin.removeListener("data", onEditorKey);
        cleanup();
        setTimeout(() => { pendingOpen = { editor: chosen, file: filePath }; onExit(); }, 20);
        return;
      }
      let i = eSelIdx;
      if (k === "\u001b[A") i -= pr;
      if (k === "\u001b[B") i += pr;
      if (k === "\u001b[C") i += 1;
      if (k === "\u001b[D") i -= 1;
      i = Math.max(0, Math.min(editors.length - 1, i));
      if (i !== eSelIdx) { eSelIdx = i; eAdjustScroll(); drawEditorContent(); }
    }

    stdin.removeListener("data", onKey);
    stdin.on("data", onEditorKey);
    clearScreen();
    renderEditor();
  }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onKey);

  enterAlt();
  fullRedraw();
}