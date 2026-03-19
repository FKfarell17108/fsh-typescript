import fs from "fs";
import path from "path";
import chalk from "chalk";
import { moveToTrash } from "./trash";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, enterAlt, exitAlt, kb } from "./tui";

export function interactiveDir(onExit: () => void) {
  let cwd = process.cwd();

  function loadDirs(dir: string): { name: string; hidden: boolean }[] {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => {
          try {
            return e.isDirectory() ||
              (e.isSymbolicLink() && fs.statSync(path.join(dir, e.name)).isDirectory());
          } catch { return false; }
        })
        .map((e) => ({ name: e.name, hidden: e.name.startsWith(".") }))
        .sort((a, b) => {
          if (a.hidden !== b.hidden) return Number(a.hidden) - Number(b.hidden);
          return a.name.localeCompare(b.name);
        });
    } catch { return []; }
  }

  let allEntries = loadDirs(cwd);
  let showHidden = false;

  function visibleEntries() {
    return showHidden ? allEntries : allEntries.filter((e) => !e.hidden);
  }

  let entries = visibleEntries();

  if (!process.stdin.isTTY) {
    console.log(entries.map((e) => e.name).join("  "));
    return onExit();
  }

  if (allEntries.length === 0) {
    console.log(chalk.gray("(no subdirectories)"));
    return onExit();
  }

  if (entries.length === 0 && allEntries.length > 0) {
    showHidden = true;
    entries    = visibleEntries();
  }

  if (entries.length === 0) {
    console.log(chalk.gray("(no subdirectories)"));
    return onExit();
  }

  const stdin   = process.stdin;
  let selIdx    = 0;
  let scrollTop = 0;

  function colWidth(): number {
    if (entries.length === 0) return 16;
    return Math.max(...entries.map((e) => e.name.length)) + 2;
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

  function navigate(key: string): boolean {
    const pr    = perRow();
    const total = entries.length;
    if (total === 0) return false;

    const curRow = Math.floor(selIdx / pr);
    const curCol = selIdx % pr;
    let next     = selIdx;

    if (key === "\u001b[A") {
      if (curRow === 0) return false;
      next = (curRow - 1) * pr + curCol;
      if (next >= total) next = total - 1;
    } else if (key === "\u001b[B") {
      if (curRow >= totalContentRows() - 1) return false;
      next = (curRow + 1) * pr + curCol;
      if (next >= total) next = total - 1;
    } else if (key === "\u001b[D") {
      if (curCol === 0) {
        if (curRow === 0) return false;
        const lastColPrevRow = Math.min(pr - 1, total - 1 - (curRow - 1) * pr);
        next = (curRow - 1) * pr + lastColPrevRow;
      } else {
        next = selIdx - 1;
      }
    } else if (key === "\u001b[C") {
      if (selIdx >= total - 1) return false;
      if (curCol >= pr - 1 || selIdx + 1 >= total) {
        const nextRowStart = (curRow + 1) * pr;
        if (nextRowStart >= total) return false;
        next = nextRowStart;
      } else {
        next = selIdx + 1;
      }
    } else if (key === "\u001b[H") {
      next = 0;
    } else if (key === "\u001b[F") {
      next = total - 1;
    } else {
      return false;
    }

    next = Math.max(0, Math.min(total - 1, next));
    if (next === selIdx) return false;
    selIdx = next;
    adjustScroll();
    return true;
  }

  function navRight(): string {
    return `${totalContentRows()}R × ${perRow()}C`;
  }

  function statLeft(): string {
    const hiddenCount = allEntries.filter((e) => e.hidden).length;
    const parts: string[] = [];
    parts.push(`${entries.length} ${entries.length === 1 ? "dir" : "dirs"}`);
    if (!showHidden && hiddenCount > 0) parts.push(chalk.dim(`${hiddenCount} hidden`));
    return parts.join("  ");
  }

  function cwdLabel(): string {
    const home = process.env.HOME ?? "";
    return cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
  }

  function buildNavHints(): string[] {
    const pr         = perRow();
    const tr         = totalContentRows();
    const v          = vis();
    const scrollInfo = tr > v ? chalk.dim(` [row ${Math.floor(selIdx / pr) + 1}/${tr}]`) : "";
    const dotLabel   = showHidden ? " hide hidden  " : " show hidden  ";

    return [
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" cd  ") + kb("tab") + chalk.gray(" up  ") + kb(".") + chalk.gray(dotLabel) + kb("d") + chalk.gray(" delete  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" cd  ") + kb("tab") + chalk.gray(" up  ") + kb(".") + chalk.gray(dotLabel) + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" cd  ") + kb("tab") + chalk.gray(" up  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" cd  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ") + kb("esc")   + chalk.gray(" quit"),
    ];
  }

  function render() {
    const pr  = perRow();
    const cw  = colWidth();
    const v   = vis();
    let out   = buildNavbarStr(buildNavHints(), navRight());

    for (let row = 0; row < v; row++) {
      out += at(NAVBAR_ROWS + 1 + row, 1) + clr();
      const fileRow = scrollTop + row;
      let line = " ";
      for (let col = 0; col < pr; col++) {
        const i = fileRow * pr + col;
        if (i >= entries.length) break;
        const { name, hidden } = entries[i];
        const isSelected = i === selIdx;
        const padded     = name.padEnd(cw, " ");

        if (isSelected) {
          line += chalk.bgWhite.black.bold(padded);
        } else if (hidden) {
          line += chalk.cyan(padded);
        } else {
          line += chalk.blue.bold(padded);
        }
      }
      out += line;
    }

    out += buildFooterStr(totalContentRows(), scrollTop, v, statLeft());
    w(out);
  }

  function fullRedraw() {
    w("\x1b[2J");
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

  function reloadEntries(newCwd: string, restoreName?: string) {
    cwd        = newCwd;
    allEntries = loadDirs(cwd);
    entries    = visibleEntries();
    if (entries.length === 0 && allEntries.length > 0) {
      showHidden = true;
      entries    = visibleEntries();
    }
    selIdx    = 0;
    scrollTop = 0;
    if (restoreName) {
      const idx = entries.findIndex((e) => e.name === restoreName);
      if (idx >= 0) selIdx = idx;
    }
    adjustScroll();
  }

  function goUp() {
    const parent = path.dirname(cwd);
    if (parent === cwd) return;
    const prevName = path.basename(cwd);
    reloadEntries(parent, prevName);
    if (entries.length === 0) { process.chdir(cwd); return exit(); }
    render();
  }

  function goInto(name: string) {
    const target = path.join(cwd, name);
    reloadEntries(target);
    if (entries.length === 0 && allEntries.length === 0) {
      process.chdir(target);
      return exit();
    }
    if (entries.length === 0) { process.chdir(target); return exit(); }
    render();
  }

  function toggleHidden() {
    const prevName = entries[selIdx]?.name;
    showHidden     = !showHidden;
    entries        = visibleEntries();
    selIdx         = 0;
    scrollTop      = 0;
    if (prevName) {
      const idx = entries.findIndex((e) => e.name === prevName);
      if (idx >= 0) selIdx = idx;
    }
    adjustScroll();
    render();
  }

  function showDeleteConfirm(entryName: string) {
    const full = path.join(cwd, entryName);

    function drawConfirmScreen() {
      const cols  = C();
      const avail = R() - NAVBAR_ROWS;
      const hints = [
        kb("y") + chalk.gray(" confirm  ") + kb("n") + chalk.gray(" / ") + kb("esc") + chalk.gray(" cancel"),
        kb("y") + chalk.gray(" yes  ") + kb("esc") + chalk.gray(" no"),
      ];
      let out     = buildNavbarStr(hints, navRight());
      let lineNum = 0;

      function line(content: string) {
        if (lineNum >= avail) return;
        out += at(NAVBAR_ROWS + 1 + lineNum, 1) + clr() + content;
        lineNum++;
      }

      line(chalk.bold("  dir  " + entryName));
      line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));

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
      } catch { line(chalk.red("  cannot read directory")); }

      for (let i = lineNum; i < avail - 2; i++) { out += at(NAVBAR_ROWS + 1 + i, 1) + clr(); lineNum++; }
      out += at(R() - 1, 1) + clr() + chalk.dim("─".repeat(Math.min(cols - 2, 60)));
      out += at(R(), 1) + clr() +
        "  " + chalk.yellow.bold("Move to Trash") + ": " +
        chalk.white(entryName) + chalk.gray(" and all its contents") + "?";
      w(out);
    }

    function onConfirmResize() { w("\x1b[2J"); drawConfirmScreen(); }

    process.stdout.removeListener("resize", onResize);
    process.stdout.on("resize", onConfirmResize);
    stdin.removeListener("data", onKey);

    function onConfirmKey(k: string) {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirmKey);
        process.stdout.removeListener("resize", onConfirmResize);
        process.stdout.on("resize", onResize);

        try {
          moveToTrash(full);
          allEntries = allEntries.filter((e) => e.name !== entryName);
          entries    = visibleEntries();
        } catch (err: any) {
          w(at(R(), 1) + clr() + chalk.red("  Error: " + err.message));
          setTimeout(() => {
            process.stdout.removeListener("resize", onConfirmResize);
            process.stdout.on("resize", onResize);
            stdin.on("data", onKey);
            fullRedraw();
          }, 1500);
          return;
        }

        if (entries.length === 0 && allEntries.length === 0) { process.chdir(cwd); return exit(); }
        selIdx = Math.min(selIdx, Math.max(0, entries.length - 1));
        stdin.on("data", onKey);
        fullRedraw();
        return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirmKey);
        process.stdout.removeListener("resize", onConfirmResize);
        process.stdout.on("resize", onResize);
        stdin.on("data", onKey);
        fullRedraw();
      }
    }

    stdin.on("data", onConfirmKey);
    w("\x1b[2J");
    drawConfirmScreen();
  }

  function onKey(k: string) {
    if (k === "\u0003" || k === "\u001b") { process.chdir(cwd); return exit(); }
    if (k === "\r")                        { goInto(entries[selIdx].name); return; }
    if (k === "\t")                        { goUp(); return; }
    if (k === ".")                         { toggleHidden(); return; }
    if (k === "d" || k === "D")           { if (entries.length > 0) showDeleteConfirm(entries[selIdx].name); return; }

    if (navigate(k)) render();
  }

  function buildNavbarStr(hints: string[], right?: string): string {
    const cols      = C();
    const rightStr  = right ? " " + right + " " : "";
    const rightLen  = visibleLen(rightStr);
    const available = cols - 2 - rightLen;
    let chosen      = hints[hints.length - 1];
    for (const h of hints) {
      if (visibleLen(h) <= available) { chosen = h; break; }
    }
    const leftPart  = padOrTrim(" " + chosen, cols - rightLen);
    const rightPart = rightLen > 0 ? chalk.bgBlack.dim(rightStr) : "";
    return at(1, 1) + clr() + chalk.bgBlack.white(leftPart) + rightPart +
           at(2, 1) + clr() + chalk.dim("─".repeat(cols));
  }

  function buildFooterStr(total: number, st: number, v: number, statL?: string): string {
    const cols    = C();
    const more    = total - (st + v);
    const leftStr = statL ? "  " + statL : "";
    const leftLen = visibleLen(leftStr);

    const scrollPart = total > v
      ? (more > 0 ? `↓ ${more} more` : "end")
      : "";
    const cwdPart  = cwdLabel();
    const sep      = scrollPart ? "  ·  " : "";
    const rightStr = "  " + (scrollPart ? scrollPart + sep : "") + cwdPart + "  ";
    const rightLen = visibleLen(rightStr);

    const gap = Math.max(0, cols - leftLen - rightLen);
    return at(NAVBAR_ROWS + 1 + v, 1) + clr() +
           chalk.dim(leftStr) + " ".repeat(gap) + chalk.dim(rightStr);
  }

  function visibleLen(str: string): number {
    return str.replace(/\x1b\[[0-9;]*[\x40-\x7e]/g, "").length;
  }

  function padOrTrim(str: string, width: number): string {
    const vlen = visibleLen(str);
    if (vlen < width) return str + " ".repeat(width - vlen);
    if (vlen === width) return str;
    let out = ""; let count = 0; let i = 0;
    while (i < str.length) {
      if (str[i] === "\x1b") {
        const end = str.indexOf("m", i);
        if (end !== -1) { out += str.slice(i, end + 1); i = end + 1; continue; }
      }
      if (count >= width - 1) { out += chalk.reset(""); break; }
      out += str[i]; count++; i++;
    }
    return out + chalk.reset("");
  }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onKey);

  enterAlt();
  fullRedraw();
}