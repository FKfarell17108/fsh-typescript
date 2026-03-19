import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  loadMeta, TrashEntry, restoreFromTrash,
  deleteFromTrash, deleteAllFromTrash, TRASH_DIR,
} from "./trash";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, drawNavbar, drawFooter, kb, enterAlt, exitAlt, clearScreen } from "./tui";

export function interactiveTrash(onExit: () => void) {
  const stdin = process.stdin;
  let entries = loadMeta();

  if (entries.length === 0) {
    console.log(chalk.gray("  (trash is empty)"));
    return onExit();
  }

  let sel       = 0;
  let scrollTop = 0;

  function vis(): number {
    return Math.max(1, R() - NAVBAR_ROWS - FOOTER_ROWS);
  }

  function adjustScroll() {
    const v = vis();
    if (sel < scrollTop) scrollTop = sel;
    if (sel >= scrollTop + v) scrollTop = sel - v + 1;
  }

  function cleanup() {
    process.stdout.removeListener("resize", onResize);
    stdin.removeAllListeners("data");
    if (stdin.isTTY) stdin.setRawMode(false);
    exitAlt();
  }

  function exit() {
    cleanup();
    setTimeout(onExit, 30);
  }

  function navRight(): string {
    return `${entries.length}R × 1C`;
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
    const v          = vis();
    const scrollInfo = entries.length > v ? chalk.dim(` [${sel + 1}/${entries.length}]`) : "";

    return [
      kb("↑↓") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" preview  ") + kb("r") + chalk.gray(" restore  ") + kb("x") + chalk.gray(" delete  ") + kb("D") + chalk.gray(" empty  ") + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" preview  ") + kb("r") + chalk.gray(" restore  ") + kb("x") + chalk.gray(" del  ")    + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ") + kb("r")     + chalk.gray(" restore  ") + kb("x") + chalk.gray(" del  ")                                         + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ") + kb("r")     + chalk.gray(" restore  ")                                                                          + kb("esc") + chalk.gray(" quit") + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ")                                                                                                                   + kb("esc") + chalk.gray(" quit"),
    ];
  }

  function drawTrashContent() {
    const cols = C();
    const v    = vis();
    let out    = "";

    for (let i = 0; i < v; i++) {
      out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
      const e = entries[scrollTop + i];
      if (!e) continue;

      const active  = (scrollTop + i) === sel;
      const icon    = e.isDir ? chalk.blue("▸") : chalk.gray("·");
      const date    = new Date(e.trashedAt).toLocaleString([], {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      const dateStr = chalk.gray(date);

      if (active) {
        const from    = e.originalPath.replace(process.env.HOME ?? "", "~");
        const dateLen = date.length;
        const fromMax = cols - dateLen - 4;
        const nameMax = cols - dateLen - Math.min(from.length + 12, fromMax) - 4;
        const name    = e.name.length > Math.max(nameMax, 8) ? e.name.slice(0, Math.max(nameMax, 8) - 1) + "…" : e.name;
        const fromTrunc = from.length > fromMax - 12 ? from.slice(0, fromMax - 13) + "…" : from;
        const left    = ` ${icon} ${name}`;
        const right   = date + chalk.dim("  from: " + fromTrunc);
        const pad     = Math.max(0, cols - visibleLen(left) - visibleLen(right) - 2);
        out += chalk.bgWhite.black.bold(left) + " ".repeat(pad) + chalk.bgWhite.black(date) + chalk.bgWhite.dim("  from: " + fromTrunc);
      } else {
        const maxName = cols - date.length - 4;
        const name    = e.name.length > maxName ? e.name.slice(0, maxName - 1) + "…" : e.name;
        const namePad = (` ${icon} ${name}`).padEnd(cols - date.length - 2);
        out += namePad + "  " + dateStr;
      }
    }

    w(out);
    drawFooter(NAVBAR_ROWS + 1 + v, entries.length, scrollTop, v, statLeft());
  }

  function render() {
    drawNavbar(buildNavHints(), navRight());
    drawTrashContent();
  }

  function fullRedraw() {
    clearScreen();
    adjustScroll();
    render();
  }

  function afterAction() {
    entries = loadMeta();
    if (entries.length === 0) return exit();
    sel = Math.min(sel, entries.length - 1);
    fullRedraw();
  }

  function showConfirmEmptyTrash() {
    const mid  = Math.floor(R() / 2);
    let out    = "";
    out += at(mid - 1, 1) + clr() + chalk.red.bold("  Empty trash?") + " " + chalk.gray("This will permanently delete all items.");
    out += at(mid,     1) + clr() + "  " + chalk.bgRed.white.bold(" y ") + chalk.gray("  yes      ") + chalk.bgGray.white.bold(" n ") + chalk.gray("  no / esc");
    out += at(mid + 1, 1) + clr();
    w(out);

    stdin.removeListener("data", onKey);
    stdin.on("data", function onConfirm(k: string) {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirm);
        deleteAllFromTrash();
        return exit();
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirm);
        fullRedraw();
        stdin.on("data", onKey);
      }
    });
  }

  function showPreview(entry: TrashEntry) {
    const src = path.join(TRASH_DIR, entry.id);

    function buildPreviewNavHints(): string[] {
      const browseHint = entry.isDir ? kb("o") + chalk.gray(" browse  ") : "";
      return [
        kb("r") + chalk.gray(" restore  ") + kb("x") + chalk.gray(" delete forever  ") + browseHint + kb("esc") + chalk.gray(" back"),
        kb("r") + chalk.gray(" restore  ") + kb("x") + chalk.gray(" delete  ")         + browseHint + kb("esc") + chalk.gray(" back"),
        kb("r") + chalk.gray(" restore  ") + kb("x") + chalk.gray(" del  ")                         + kb("esc") + chalk.gray(" back"),
        kb("r") + chalk.gray(" restore  ")                                                           + kb("esc") + chalk.gray(" back"),
        kb("esc") + chalk.gray(" back"),
      ];
    }

    function drawPreviewContent() {
      const cols  = C();
      const v     = Math.max(1, R() - NAVBAR_ROWS);
      let out     = "";
      let lineNum = 0;

      function line(content: string) {
        if (lineNum >= v) return;
        out += at(NAVBAR_ROWS + 1 + lineNum, 1) + clr() + content;
        lineNum++;
      }

      line(chalk.bold((entry.isDir ? "  dir" : " file") + "  " + entry.name));
      line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));

      if (entry.isDir) {
        try {
          const children = fs.readdirSync(src, { withFileTypes: true });
          if (children.length === 0) {
            line(chalk.gray("  (empty directory)"));
          } else {
            for (const c of children.slice(0, v - 4)) {
              line((c.isDirectory() ? chalk.blue("  ▸ ") : chalk.gray("    ")) + chalk.white(c.name));
            }
            if (children.length > v - 4) line(chalk.gray(`  ... and ${children.length - (v - 4)} more`));
          }
        } catch { line(chalk.red("  cannot read directory")); }
      } else {
        try {
          const fileLines = fs.readFileSync(src, "utf8").split("\n");
          for (const fl of fileLines.slice(0, v - 4)) {
            const d = fl.length > cols - 4 ? fl.slice(0, cols - 5) + "…" : fl;
            line(chalk.white("  " + d));
          }
          if (fileLines.length > v - 4) line(chalk.gray(`  ... ${fileLines.length - (v - 4)} more lines`));
        } catch { line(chalk.gray("  (binary file)")); }
      }

      for (let i = lineNum; i < v; i++) {
        out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
      }
      w(out);
    }

    function renderPreview() {
      drawNavbar(buildPreviewNavHints(), navRight());
      drawPreviewContent();
    }

    function onPreviewResize() { clearScreen(); renderPreview(); }

    process.stdout.removeListener("resize", onResize);
    process.stdout.on("resize", onPreviewResize);

    function onPreviewKey(k: string) {
      if (k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onPreviewKey);
        process.stdout.removeListener("resize", onPreviewResize);
        process.stdout.on("resize", onResize);
        fullRedraw();
        stdin.on("data", onKey);
        return;
      }
      if (k === "r") {
        stdin.removeListener("data", onPreviewKey);
        process.stdout.removeListener("resize", onPreviewResize);
        process.stdout.on("resize", onResize);
        restoreFromTrash(entry);
        afterAction();
        return;
      }
      if (k === "x") {
        stdin.removeListener("data", onPreviewKey);
        process.stdout.removeListener("resize", onPreviewResize);
        process.stdout.on("resize", onResize);
        deleteFromTrash(entry);
        afterAction();
        return;
      }
      if (k === "o" && entry.isDir) {
        stdin.removeListener("data", onPreviewKey);
        process.stdout.removeListener("resize", onPreviewResize);
        browseDir(src, entry.name, stdin, () => {
          process.stdout.on("resize", onResize);
          fullRedraw();
          stdin.on("data", onKey);
        });
        return;
      }
    }

    stdin.removeListener("data", onKey);
    stdin.on("data", onPreviewKey);
    clearScreen();
    renderPreview();
  }

  function onResize() { fullRedraw(); }

  function onKey(k: string) {
    if (k === "\u001b" || k === "\u0003") return exit();
    if (k === "\u001b[A") {
      if (sel > 0) { sel--; adjustScroll(); render(); }
      return;
    }
    if (k === "\u001b[B") {
      if (sel < entries.length - 1) { sel++; adjustScroll(); render(); }
      return;
    }
    if (k.startsWith("\u001b")) return;
    if (k === "\r") return showPreview(entries[sel]);
    if (k === "r") { restoreFromTrash(entries[sel]); afterAction(); return; }
    if (k === "x") { deleteFromTrash(entries[sel]); afterAction(); return; }
    if (k === "D") return showConfirmEmptyTrash();
  }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onKey);

  enterAlt();
  fullRedraw();
}

function visibleLen(str: string): number {
  return str.replace(/\x1b\[[0-9;]*[\x40-\x7e]/g, "").length;
}

function browseDir(
  dirPath: string,
  label: string,
  stdin: NodeJS.ReadStream,
  onBack: () => void
) {
  let entries: { name: string; isDir: boolean }[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  } catch { onBack(); return; }

  let sel       = 0;
  let scrollTop = 0;

  function vis(): number { return Math.max(1, R() - NAVBAR_ROWS - FOOTER_ROWS); }
  function adjustScroll() {
    const v = vis();
    if (sel < scrollTop) scrollTop = sel;
    if (sel >= scrollTop + v) scrollTop = sel - v + 1;
  }

  function navRight(): string { return `${entries.length}R × 1C`; }

  function statLeft(): string {
    const dirs  = entries.filter((e) => e.isDir).length;
    const files = entries.length - dirs;
    const parts: string[] = [];
    if (dirs  > 0) parts.push(`${dirs} ${dirs  === 1 ? "dir"  : "dirs"}`);
    if (files > 0) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
    return parts.join("  ");
  }

  function buildNavHints(): string[] {
    const v          = vis();
    const scrollInfo = entries.length > v ? chalk.dim(` [${sel + 1}/${entries.length}]`) : "";
    const lbl        = chalk.dim("  " + label);
    return [
      kb("↑↓") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("esc") + chalk.gray(" back") + lbl + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" open  ") + kb("esc") + chalk.gray(" back") + scrollInfo,
      kb("↑↓") + chalk.gray(" move  ")               +                         kb("esc") + chalk.gray(" back") + scrollInfo,
      kb("esc") + chalk.gray(" back"),
    ];
  }

  function drawBrowseContent() {
    const cols = C();
    const v    = vis();
    let out    = "";

    for (let i = 0; i < v; i++) {
      out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
      const e = entries[scrollTop + i];
      if (!e) continue;
      const active = (scrollTop + i) === sel;
      const icon   = e.isDir ? chalk.blue("▸ ") : chalk.gray("  ");
      const padded = (icon + e.name).padEnd(cols - 2);
      out += active
        ? " " + chalk.bgWhite.black.bold(padded)
        : " " + (e.isDir ? chalk.blue(padded) : chalk.white(padded));
    }

    if (entries.length === 0) out += at(NAVBAR_ROWS + 1, 1) + chalk.gray("  (empty)");
    w(out);
    drawFooter(NAVBAR_ROWS + 1 + v, entries.length, scrollTop, v, statLeft());
  }

  function render() { drawNavbar(buildNavHints(), navRight()); drawBrowseContent(); }
  function onBrowseResize() { clearScreen(); render(); }

  process.stdout.on("resize", onBrowseResize);

  function onKey(k: string) {
    if (k === "\u001b" || k === "\u0003") {
      stdin.removeListener("data", onKey);
      process.stdout.removeListener("resize", onBrowseResize);
      onBack();
      return;
    }
    if (k === "\u001b[A" && sel > 0) { sel--; adjustScroll(); render(); return; }
    if (k === "\u001b[B" && sel < entries.length - 1) { sel++; adjustScroll(); render(); return; }
    if (k.startsWith("\u001b")) return;

    if (k === "\r" && entries.length > 0) {
      const e        = entries[sel];
      const fullPath = path.join(dirPath, e.name);
      if (e.isDir) {
        stdin.removeListener("data", onKey);
        process.stdout.removeListener("resize", onBrowseResize);
        browseDir(fullPath, label + "/" + e.name, stdin, () => {
          process.stdout.on("resize", onBrowseResize);
          clearScreen();
          render();
          stdin.on("data", onKey);
        });
      } else {
        stdin.removeListener("data", onKey);
        process.stdout.removeListener("resize", onBrowseResize);
        browseFile(fullPath, e.name, stdin, () => {
          process.stdout.on("resize", onBrowseResize);
          clearScreen();
          render();
          stdin.on("data", onKey);
        });
      }
    }
  }

  stdin.on("data", onKey);
  clearScreen();
  render();
}

function browseFile(
  filePath: string,
  name: string,
  stdin: NodeJS.ReadStream,
  onBack: () => void
) {
  function buildNavHints(): string[] {
    return [
      kb("esc") + chalk.gray(" back") + "  " + chalk.dim(name),
      kb("esc") + chalk.gray(" back"),
    ];
  }

  function drawFileContent() {
    const cols  = C();
    const v     = Math.max(1, R() - NAVBAR_ROWS);
    let out     = "";
    let lineNum = 0;

    function line(content: string) {
      if (lineNum >= v) return;
      out += at(NAVBAR_ROWS + 1 + lineNum, 1) + clr() + content;
      lineNum++;
    }

    try {
      const fileLines = fs.readFileSync(filePath, "utf8").split("\n");
      for (const fl of fileLines.slice(0, v)) {
        const d = fl.length > cols - 4 ? fl.slice(0, cols - 5) + "…" : fl;
        line(chalk.white("  " + d));
      }
      if (fileLines.length > v) line(chalk.gray(`  ... ${fileLines.length - v} more lines`));
    } catch { line(chalk.gray("  (binary file)")); }

    for (let i = lineNum; i < v; i++) out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
    w(out);
  }

  function render() { drawNavbar(buildNavHints()); drawFileContent(); }
  function onFileResize() { clearScreen(); render(); }

  process.stdout.on("resize", onFileResize);

  function onKey(k: string) {
    if (k === "\u001b" || k === "\u0003" || k === "q") {
      stdin.removeListener("data", onKey);
      process.stdout.removeListener("resize", onFileResize);
      onBack();
    }
  }

  stdin.on("data", onKey);
  clearScreen();
  render();
}