import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execFileSync } from "child_process";
import { moveToTrash } from "./trash";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, drawNavbar, drawFooter, kb, enterAlt, exitAlt, clearScreen, visibleLen } from "./tui";

const EDITOR_CANDIDATES = [
  "nvim", "vim", "vi", "nano", "emacs", "micro", "hx", "helix", "code", "gedit",
];

function getInstalledEditors(): string[] {
  const installed: string[] = [];
  for (const editor of EDITOR_CANDIDATES) {
    try { execFileSync("which", [editor], { stdio: "ignore" }); installed.push(editor); }
    catch {}
  }
  return installed;
}

export let pendingOpen: { editor: string; file: string } | null = null;
export function clearPendingOpen() { pendingOpen = null; }

export function interactiveLs(onExit: () => void) {
  const cwd = process.cwd();

  function loadAll(): { name: string; isDir: boolean }[] {
    try {
      return fs.readdirSync(cwd).map((name) => {
        const full = path.join(cwd, name);
        let isDir  = false;
        try { isDir = fs.statSync(full).isDirectory(); } catch {}
        return { name, isDir };
      }).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    } catch { return []; }
  }

  let allEntries = loadAll();

  if (allEntries.length === 0 && !process.stdin.isTTY) {
    return onExit();
  }

  if (!process.stdin.isTTY) {
    console.log(allEntries.map((e) => e.name).join("  "));
    return onExit();
  }

  if (allEntries.length === 0) {
    console.log("(empty directory)");
    return onExit();
  }

  let showHidden = false;

  function visibleEntries() {
    return showHidden ? allEntries : allEntries.filter((e) => !e.name.startsWith("."));
  }

  let entries = visibleEntries();

  if (entries.length === 0 && allEntries.length > 0) {
    showHidden = true;
    entries    = visibleEntries();
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
    const dirs    = entries.filter((e) => e.isDir).length;
    const files   = entries.length - dirs;
    const hiddenC = allEntries.filter((e) => e.name.startsWith(".")).length;
    const parts: string[] = [];
    if (dirs   > 0) parts.push(`${dirs} ${dirs   === 1 ? "dir"  : "dirs"}`);
    if (files  > 0) parts.push(`${files} ${files  === 1 ? "file" : "files"}`);
    if (!showHidden && hiddenC > 0) parts.push(chalk.dim(`${hiddenC} hidden`));
    return parts.join("  ");
  }

  function buildNavHints(): string[] {
    const pr         = perRow();
    const tr         = totalContentRows();
    const v          = vis();
    const scrollInfo = tr > v ? chalk.dim(` [row ${Math.floor(selIdx / pr) + 1}/${tr}]`) : "";
    const dotLabel   = showHidden ? " hide hidden  " : " show hidden  ";

    return [
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb(".") + chalk.gray(dotLabel) + kb("d") + chalk.gray(" delete  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb(".") + chalk.gray(dotLabel) + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
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

  function showDeleteConfirm(entryName: string, isDir: boolean) {
    const full = path.join(cwd, entryName);

    function drawConfirmContent() {
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
            if (children.length > avail - 6) line(chalk.gray(`  ... and ${children.length - (avail - 6)} more`));
          }
        } catch { line(chalk.red("  cannot read directory")); }
      } else {
        try {
          const fileLines = fs.readFileSync(full, "utf8").split("\n");
          for (const fl of fileLines.slice(0, avail - 6)) {
            const d = fl.length > cols - 4 ? fl.slice(0, cols - 5) + "…" : fl;
            line(chalk.white("  " + d));
          }
          if (fileLines.length > avail - 6) line(chalk.gray(`  ... ${fileLines.length - (avail - 6)} more lines`));
        } catch { line(chalk.gray("  (binary file)")); }
      }

      for (let i = lineNum; i < avail - 2; i++) { out += at(NAVBAR_ROWS + 1 + i, 1) + clr(); lineNum++; }
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
          allEntries = allEntries.filter((e) => e.name !== entryName);
          entries    = visibleEntries();
        } catch (err: any) {
          w(at(R(), 1) + clr() + chalk.red("  Error: " + err.message));
          setTimeout(() => { stdin.on("data", onKey); fullRedraw(); }, 1500);
          return;
        }
        if (entries.length === 0 && allEntries.length === 0) return exit();
        selIdx = Math.min(selIdx, Math.max(0, entries.length - 1));
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
    w("\x1b[2J");
    drawConfirmContent();
  }

  function onKey(k: string) {
    if (k === "\u0003" || k === "\u001b") return exit();
    if (k === ".")                        { toggleHidden(); return; }
    if (k === "d" || k === "D")          { if (entries.length > 0) showDeleteConfirm(entries[selIdx].name, entries[selIdx].isDir); return; }

    if (k === "\r") {
      const selected = entries[selIdx];
      if (selected.isDir) {
        try { process.chdir(path.join(cwd, selected.name)); } catch {}
        return exit();
      }
      return showEditorPicker(path.join(cwd, selected.name));
    }

    if (navigate(k)) render();
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

    function ePerRow(): number    { return Math.max(1, Math.floor(C() / EW)); }
    function eTotalRows(): number { return Math.ceil(editors.length / ePerRow()); }
    function eVis(): number       { return Math.max(1, R() - NAVBAR_ROWS - 3 - FOOTER_ROWS); }

    function eAdjustScroll() {
      const pr  = ePerRow();
      const row = Math.floor(eSelIdx / pr);
      const v   = eVis();
      if (row < eScrollTop) eScrollTop = row;
      if (row >= eScrollTop + v) eScrollTop = row - v + 1;
    }

    function eNavigate(key: string): boolean {
      const pr    = ePerRow();
      const total = editors.length;
      if (total === 0) return false;

      const curRow = Math.floor(eSelIdx / pr);
      const curCol = eSelIdx % pr;
      let next     = eSelIdx;

      if (key === "\u001b[A") {
        if (curRow === 0) return false;
        next = (curRow - 1) * pr + curCol;
        if (next >= total) next = total - 1;
      } else if (key === "\u001b[B") {
        const totalRows = Math.ceil(total / pr);
        if (curRow >= totalRows - 1) return false;
        next = (curRow + 1) * pr + curCol;
        if (next >= total) next = total - 1;
      } else if (key === "\u001b[D") {
        if (curCol === 0) return false;
        next = eSelIdx - 1;
      } else if (key === "\u001b[C") {
        if (eSelIdx >= total - 1) return false;
        next = eSelIdx + 1;
      } else { return false; }

      next = Math.max(0, Math.min(total - 1, next));
      if (next === eSelIdx) return false;
      eSelIdx = next;
      eAdjustScroll();
      return true;
    }

    function drawEditorContent() {
      const pr    = ePerRow();
      const v     = eVis();
      const cols  = C();
      const fname = chalk.white(path.basename(filePath));
      const hints = [
        kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + kb("esc") + chalk.gray(" back"),
        kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + kb("esc") + chalk.gray(" back"),
        kb("↑↓")   + chalk.gray(" move  ") + kb("esc")   + chalk.gray(" back"),
      ];
      const right = `${Math.ceil(editors.length / pr)}R × ${pr}C`;
      let out = buildNavbarStr(hints, right);

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

      out += buildFooterStr(eTotalRows(), eScrollTop, v,
        `${editors.length} ${editors.length === 1 ? "editor" : "editors"}`);
      w(out);
    }

    function onEditorKey(k: string) {
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
      if (eNavigate(k)) drawEditorContent();
    }

    stdin.removeListener("data", onKey);
    stdin.on("data", onEditorKey);
    w("\x1b[2J");
    drawEditorContent();
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
    const cols     = C();
    const more     = total - (st + v);
    const leftStr  = statL ? "  " + statL : "";
    const leftLen  = visibleLen(leftStr);
    let rightStr   = "";
    if (total > v) rightStr = more > 0 ? `  ↓ ${more} more  ` : "  (end)  ";
    const rightLen = visibleLen(rightStr);
    const gap      = Math.max(0, cols - leftLen - rightLen);
    return at(NAVBAR_ROWS + 1 + v, 1) + clr() +
           chalk.dim(leftStr) + " ".repeat(gap) + chalk.dim(rightStr);
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