import fs from "fs";
import path from "path";
import chalk from "chalk";
import {
  loadMeta, TrashEntry, restoreFromTrash,
  deleteFromTrash, deleteAllFromTrash, TRASH_DIR,
} from "./trash";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, drawNavbar, drawFooter, kb, enterAlt, exitAlt, clearScreen, visibleLen } from "./tui";

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

  function renderMain() {
    const cols = C();
    const v    = vis();
    let out    = "";

    out += drawNavbarStr(buildNavHints(), navRight());

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
        const from      = e.originalPath.replace(process.env.HOME ?? "", "~");
        const fromMax   = Math.floor(cols * 0.4);
        const fromTrunc = from.length > fromMax ? from.slice(0, fromMax - 1) + "…" : from;
        const nameMax   = cols - date.length - visibleLen("  from: " + fromTrunc) - 4;
        const name      = e.name.length > Math.max(nameMax, 8) ? e.name.slice(0, Math.max(nameMax, 8) - 1) + "…" : e.name;
        const left      = ` ${icon} ${name}`;
        const rightVis  = date + "  from: " + fromTrunc;
        const pad       = Math.max(0, cols - visibleLen(left) - visibleLen(rightVis) - 2);
        out += chalk.bgWhite.black.bold(left) +
               " ".repeat(pad) +
               chalk.bgWhite.black(date) +
               chalk.bgWhite.dim("  from: " + fromTrunc);
      } else {
        const maxName = cols - date.length - 4;
        const name    = e.name.length > maxName ? e.name.slice(0, maxName - 1) + "…" : e.name;
        const namePad = (` ${icon} ${name}`).padEnd(cols - date.length - 2);
        out += namePad + "  " + dateStr;
      }
    }

    out += drawFooterStr(entries.length, scrollTop, v, statLeft());
    w(out);
  }

  function fullRedraw() {
    w("\x1b[2J");
    adjustScroll();
    renderMain();
  }

  function afterAction() {
    entries = loadMeta();
    if (entries.length === 0) return exit();
    sel = Math.min(sel, entries.length - 1);
    fullRedraw();
  }

  function drawNavbarStr(hints: string[], right?: string): string {
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

  function drawFooterStr(total: number, st: number, v: number, statL?: string): string {
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

  function showConfirm(opts: {
    icon: string;
    name: string;
    isDir: boolean;
    actionLabel: string;
    actionColor: (s: string) => string;
    src?: string;
    onConfirm: () => void;
    onCancel: () => void;
    onResumeResize: () => void;
    currentResizeHandler: () => void;
  }) {
    const {
      icon, name, isDir, actionLabel, actionColor,
      src, onConfirm, onCancel, onResumeResize, currentResizeHandler,
    } = opts;

    function buildConfirmNavHints(): string[] {
      return [
        kb("y") + chalk.gray(" confirm  ") + kb("n") + chalk.gray(" / ") + kb("esc") + chalk.gray(" cancel"),
        kb("y") + chalk.gray(" yes  ") + kb("esc") + chalk.gray(" no"),
      ];
    }

    function drawConfirmScreen() {
      const cols  = C();
      const avail = R() - NAVBAR_ROWS;
      let out     = drawNavbarStr(buildConfirmNavHints());
      let lineNum = 0;

      function line(content: string) {
        if (lineNum >= avail) return;
        out += at(NAVBAR_ROWS + 1 + lineNum, 1) + clr() + content;
        lineNum++;
      }

      line(chalk.bold(icon + "  " + name));
      line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));

      if (src) {
        if (isDir) {
          try {
            const children = fs.readdirSync(src, { withFileTypes: true });
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
            const fileLines = fs.readFileSync(src, "utf8").split("\n");
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
      }

      for (let i = lineNum; i < avail - 2; i++) {
        out += at(NAVBAR_ROWS + 1 + i, 1) + clr();
        lineNum++;
      }

      out += at(R() - 1, 1) + clr() + chalk.dim("─".repeat(Math.min(cols - 2, 60)));
      out += at(R(), 1) + clr() +
        "  " + actionColor(actionLabel) + ": " + chalk.white(name) +
        (isDir ? chalk.gray(" and all its contents") : "") + "?";

      w(out);
    }

    function onConfirmResize() { w("\x1b[2J"); drawConfirmScreen(); }

    process.stdout.removeListener("resize", currentResizeHandler);
    process.stdout.on("resize", onConfirmResize);

    function onConfirmKey(k: string) {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirmKey);
        process.stdout.removeListener("resize", onConfirmResize);
        process.stdout.on("resize", onResumeResize);
        onConfirm();
        return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirmKey);
        process.stdout.removeListener("resize", onConfirmResize);
        process.stdout.on("resize", onResumeResize);
        onCancel();
      }
    }

    stdin.on("data", onConfirmKey);
    w("\x1b[2J");
    drawConfirmScreen();
  }

  function showConfirmDeleteEntry(entry: TrashEntry) {
    const src = path.join(TRASH_DIR, entry.id);
    stdin.removeListener("data", onKey);

    showConfirm({
      icon:     entry.isDir ? "  dir" : " file",
      name:     entry.name,
      isDir:    entry.isDir,
      actionLabel: "Permanently delete",
      actionColor: chalk.red.bold,
      src,
      onConfirm: () => {
        deleteFromTrash(entry);
        afterAction();
        stdin.on("data", onKey);
      },
      onCancel: () => {
        fullRedraw();
        stdin.on("data", onKey);
      },
      onResumeResize: onResize,
      currentResizeHandler: onResize,
    });
  }

  function showConfirmEmptyTrash() {
    stdin.removeListener("data", onKey);

    showConfirm({
      icon:        "  trash",
      name:        "all items",
      isDir:       true,
      actionLabel: "Empty trash — delete all",
      actionColor: chalk.red.bold,
      src:         undefined,
      onConfirm: () => {
        deleteAllFromTrash();
        exit();
      },
      onCancel: () => {
        fullRedraw();
        stdin.on("data", onKey);
      },
      onResumeResize: onResize,
      currentResizeHandler: onResize,
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

    function renderPreview() {
      const cols  = C();
      const v     = Math.max(1, R() - NAVBAR_ROWS);
      let out     = drawNavbarStr(buildPreviewNavHints(), navRight());
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

    function onPreviewResize() { w("\x1b[2J"); renderPreview(); }

    process.stdout.removeListener("resize", onResize);
    process.stdout.on("resize", onPreviewResize);

    function backToList() {
      stdin.removeListener("data", onPreviewKey);
      process.stdout.removeListener("resize", onPreviewResize);
      process.stdout.on("resize", onResize);
      fullRedraw();
      stdin.on("data", onKey);
    }

    function onPreviewKey(k: string) {
      if (k === "\u001b" || k === "\u0003") {
        backToList();
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

        showConfirm({
          icon:        entry.isDir ? "  dir" : " file",
          name:        entry.name,
          isDir:       entry.isDir,
          actionLabel: "Permanently delete",
          actionColor: chalk.red.bold,
          src,
          onConfirm: () => {
            deleteFromTrash(entry);
            afterAction();
          },
          onCancel: () => {
            process.stdout.on("resize", onPreviewResize);
            w("\x1b[2J");
            renderPreview();
            stdin.on("data", onPreviewKey);
          },
          onResumeResize: onPreviewResize,
          currentResizeHandler: onPreviewResize,
        });
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
    w("\x1b[2J");
    renderPreview();
  }

  function onResize() { fullRedraw(); }

  function onKey(k: string) {
    if (k === "\u001b" || k === "\u0003") return exit();
    if (k === "\u001b[A") {
      if (sel > 0) { sel--; adjustScroll(); renderMain(); }
      return;
    }
    if (k === "\u001b[B") {
      if (sel < entries.length - 1) { sel++; adjustScroll(); renderMain(); }
      return;
    }
    if (k.startsWith("\u001b")) return;
    if (k === "\r") return showPreview(entries[sel]);
    if (k === "r") { restoreFromTrash(entries[sel]); afterAction(); return; }
    if (k === "x") { showConfirmDeleteEntry(entries[sel]); return; }
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

  function render() {
    const cols = C();
    const v    = vis();
    let out    = drawNavbarStr(buildNavHints(), navRight());

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
    out += drawFooterStr(entries.length, scrollTop, v, statLeft());
    w(out);
  }

  function drawNavbarStr(hints: string[], right?: string): string {
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

  function drawFooterStr(total: number, st: number, v: number, statL?: string): string {
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

  function onBrowseResize() { w("\x1b[2J"); render(); }

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
          w("\x1b[2J");
          render();
          stdin.on("data", onKey);
        });
      } else {
        stdin.removeListener("data", onKey);
        process.stdout.removeListener("resize", onBrowseResize);
        browseFile(fullPath, e.name, stdin, () => {
          process.stdout.on("resize", onBrowseResize);
          w("\x1b[2J");
          render();
          stdin.on("data", onKey);
        });
      }
    }
  }

  stdin.on("data", onKey);
  w("\x1b[2J");
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

  function drawNavbarStr(hints: string[]): string {
    const cols      = C();
    const available = cols - 2;
    let chosen      = hints[hints.length - 1];
    for (const h of hints) {
      if (visibleLen(h) <= available) { chosen = h; break; }
    }
    const leftPart = padOrTrim(" " + chosen, cols);
    return at(1, 1) + clr() + chalk.bgBlack.white(leftPart) +
           at(2, 1) + clr() + chalk.dim("─".repeat(cols));
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

  function render() {
    const cols  = C();
    const v     = Math.max(1, R() - NAVBAR_ROWS);
    let out     = drawNavbarStr(buildNavHints());
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

  function onFileResize() { w("\x1b[2J"); render(); }

  process.stdout.on("resize", onFileResize);

  function onKey(k: string) {
    if (k === "\u001b" || k === "\u0003" || k === "q") {
      stdin.removeListener("data", onKey);
      process.stdout.removeListener("resize", onFileResize);
      onBack();
    }
  }

  stdin.on("data", onKey);
  w("\x1b[2J");
  render();
}