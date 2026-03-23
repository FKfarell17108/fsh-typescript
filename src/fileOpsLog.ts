import chalk from "chalk";
import path from "path";
import fs from "fs";
import { getLog, loadLog, FileOp, OpKind } from "./fileOps";
import { w, at, clr, C, R, drawNavbar, NavItem, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";
import { LogSort, DEFAULT_LOG_SORT, logSortLabel, showSortPicker } from "./sort";

function sortLog(ops: FileOp[], sort: LogSort): FileOp[] {
  const arr = [...ops];
  arr.sort((a, b) => {
    if (sort.key === "date")   { return sort.dir === "desc" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp; }
    if (sort.key === "kind")   { const c = a.kind.localeCompare(b.kind); return sort.dir === "asc" ? c : -c; }
    if (sort.key === "status") {
      const order = { done: 0, pending: 1, error: 2 };
      const c = (order[a.status] ?? 1) - (order[b.status] ?? 1);
      return sort.dir === "asc" ? c : -c;
    }
    return 0;
  });
  return arr;
}

function kindLabel(kind: OpKind): string {
  switch (kind) {
    case "copy":   return chalk.cyan.bold("copy  ");
    case "cut":    return chalk.yellow.bold("cut   ");
    case "move":   return chalk.magenta.bold("move  ");
    case "rename": return chalk.blue.bold("rename");
  }
}

function kindLabelRaw(kind: OpKind): string {
  switch (kind) {
    case "copy":   return "copy  ";
    case "cut":    return "cut   ";
    case "move":   return "move  ";
    case "rename": return "rename";
  }
}

function statusBadge(op: FileOp): string {
  if (op.status === "done")  return chalk.green("✓");
  if (op.status === "error") return chalk.red("✗");
  return chalk.yellow("…");
}

function statusBadgeRaw(op: FileOp): string {
  if (op.status === "done")  return "✓";
  if (op.status === "error") return "✗";
  return "…";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function homify(p: string): string {
  const home = process.env.HOME ?? "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function canUndo(op: FileOp): boolean {
  if (op.status !== "done") return false;
  if (op.kind === "copy") return fs.existsSync(op.destPath);
  if (op.kind === "move" || op.kind === "cut") return fs.existsSync(op.destPath) && !fs.existsSync(op.srcPath);
  if (op.kind === "rename") {
    const undoDest = path.join(path.dirname(op.destPath), op.srcName);
    return fs.existsSync(op.destPath) && !fs.existsSync(undoDest);
  }
  return false;
}

function performUndo(op: FileOp): string | null {
  try {
    if (op.kind === "copy") { fs.rmSync(op.destPath, { recursive: true, force: true }); return null; }
    if (op.kind === "move" || op.kind === "cut") {
      fs.mkdirSync(path.dirname(op.srcPath), { recursive: true });
      fs.renameSync(op.destPath, op.srcPath);
      return null;
    }
    if (op.kind === "rename") {
      const undoDest = path.join(path.dirname(op.destPath), op.srcName);
      fs.renameSync(op.destPath, undoDest);
      return null;
    }
    return "unsupported operation";
  } catch (e: any) {
    try {
      if (op.kind === "move" || op.kind === "cut") {
        fs.mkdirSync(path.dirname(op.srcPath), { recursive: true });
        copyRecursive(op.destPath, op.srcPath);
        fs.rmSync(op.destPath, { recursive: true, force: true });
        return null;
      }
    } catch (e2: any) { return e2.message; }
    return e.message;
  }
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) copyRecursive(path.join(src, child), path.join(dest, child));
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function removeOpFromLog(id: string): void {
  const LOG_FILE = path.join(require("os").homedir(), ".fsh_fileops.json");
  try {
    const raw: FileOp[] = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    fs.writeFileSync(LOG_FILE, JSON.stringify(raw.filter(o => o.id !== id), null, 2), "utf8");
  } catch {}
}

function removeOpsFromLog(ids: Set<string>): void {
  const LOG_FILE = path.join(require("os").homedir(), ".fsh_fileops.json");
  try {
    const raw: FileOp[] = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    fs.writeFileSync(LOG_FILE, JSON.stringify(raw.filter(o => !ids.has(o.id)), null, 2), "utf8");
  } catch {}
}

function runLogPanel(stdin: NodeJS.ReadStream, onBack: () => void, ownsAltScreen: boolean): void {
  loadLog();
  let rawOps = getLog();
  let currentSort: LogSort = { ...DEFAULT_LOG_SORT };
  let ops = sortLog(rawOps, currentSort);
  let sel = 0; let scrollTop = 0;
  let selected = new Set<string>();

  function NAV(): NavItem[] {
    return [
      { key: "Nav", label: "Navigate" },
      { key: "Ent", label: "Detail"   },
      { key: "Spc", label: "Select"   },
      { key: "A",   label: "All"      },
      { key: "U",   label: "Undo"     },
      { key: "X",   label: "Delete"   },
      { key: "Esc", label: selected.size > 0 ? "Deselect" : "Back" },
    ];
  }

  const NR = 2;
  function vis(): number { return Math.max(1, R() - NR - 3); }
  function adjustScroll(): void { const v = vis(); if (sel < scrollTop) scrollTop = sel; if (sel >= scrollTop + v) scrollTop = sel - v + 1; }

  function applySort(): void {
    const prevId = ops[sel]?.id;
    ops = sortLog(rawOps, currentSort);
    sel = 0;
    if (prevId) { const idx = ops.findIndex(o => o.id === prevId); if (idx >= 0) sel = idx; }
    adjustScroll();
  }

  function getTargets(): FileOp[] {
    if (selected.size > 0) return ops.filter(o => selected.has(o.id));
    return ops.length ? [ops[sel]] : [];
  }
  function toggleSelect(): void { if (!ops.length) return; const id = ops[sel].id; if (selected.has(id)) selected.delete(id); else selected.add(id); }
  function selectAll(): void { if (selected.size === ops.length) selected.clear(); else selected = new Set(ops.map(o => o.id)); }

  function buildLeft(): string {
    let s = ops.length ? `File History  ${ops.length} op${ops.length === 1 ? "" : "s"}` : "File History";
    if (selected.size) s += chalk.magenta(`  ${selected.size} sel`);
    return s;
  }
  function buildRight(): string {
    if (ops.length <= vis()) return "";
    const more = ops.length - (scrollTop + vis());
    return more > 0 ? `↓ ${more} more` : "end";
  }

  function drawMiniBar(): void {
    const cols = C();
    const line = "  " + chalk.white("[") + chalk.cyan.bold("S") + chalk.white("]") + chalk.dim(" Sort: ") + chalk.cyan(logSortLabel(currentSort));
    const vl   = visibleLen(line);
    w(at(R() - 1, 1) + "\x1b[2K\x1b[0m" + line + (vl < cols ? " ".repeat(cols - vl) : ""));
  }

  function drawBottom(): void {
    drawMiniBar();
    const cols = C();
    const ls   = buildLeft()  ? "  " + buildLeft()  : "";
    const rs   = buildRight() ? buildRight() + "  " : "";
    const gap  = Math.max(0, cols - visibleLen(ls) - visibleLen(rs));
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + chalk.dim(ls) + " ".repeat(gap) + chalk.dim(rs));
  }

  function drawLogContent(): void {
    const start = NR + 2; const cols = C(); const v = vis();
    let out = "";
    if (!ops.length) {
      out += at(start, 1) + clr() + chalk.dim("  (no file operations yet)");
      for (let i = 1; i < v; i++) out += at(start + i, 1) + clr();
      w(out); return;
    }
    for (let i = 0; i < v; i++) {
      out += at(start + i, 1) + clr();
      const op       = ops[scrollTop + i]; if (!op) continue;
      const isActive = (scrollTop + i) === sel;
      const isSel    = selected.has(op.id);
      const badgeRaw = statusBadgeRaw(op);
      const kRaw     = kindLabelRaw(op.kind);
      const srcShort = path.basename(op.srcPath);
      const timeStr  = fmtTime(op.timestamp);
      const undoHint = canUndo(op) ? " ↩" : "  ";
      const nameStr  = srcShort.length > 26 ? srcShort.slice(0, 25) + "…" : srcShort.padEnd(26);
      const rawLeft  = ` ${badgeRaw} ${kRaw}  ${nameStr}${undoHint}`;
      const timeLen  = timeStr.length;
      const leftW    = cols - timeLen - 2;

      if (isActive && isSel) {
        out += chalk.bgMagenta.white.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgMagenta.white.bold(timeStr);
      } else if (isActive) {
        out += chalk.bgWhite.black.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgWhite.black.bold(timeStr);
      } else if (isSel) {
        out += chalk.magenta.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.magenta.bold(timeStr);
      } else {
        const coloredLeft = ` ${statusBadge(op)} ${kindLabel(op.kind)}  ${nameStr}` + (canUndo(op) ? chalk.green(" ↩") : chalk.dim("  "));
        out += coloredLeft + " ".repeat(Math.max(1, cols - visibleLen(coloredLeft) - timeLen - 2)) + "  " + chalk.dim(timeStr);
      }
    }
    w(out);
  }

  function drawDetailContent(op: FileOp): void {
    const start  = NR + 2; const v = R() - NR - 2;
    const kindColor = op.kind === "copy" ? chalk.cyan : op.kind === "move" ? chalk.magenta : op.kind === "rename" ? chalk.blue : chalk.yellow;
    const undoable  = canUndo(op);
    let out = ""; let ln = 0;
    function line(content: string) { if (ln >= v) return; out += at(start + ln, 1) + clr() + content; ln++; }
    line(""); line("  " + kindColor.bold(op.kind.toUpperCase()) + "  " + statusBadge(op) + "  " + chalk.dim(fmtTime(op.timestamp)));
    line("  " + chalk.dim("id: " + op.id)); line("");
    line("  " + chalk.dim("from")); line("  " + chalk.white(homify(op.srcPath))); line("");
    if (op.kind === "rename") { line("  " + chalk.dim("renamed to")); line("  " + chalk.white(op.destName)); }
    else { line("  " + chalk.dim("to")); line("  " + chalk.white(homify(op.destPath))); }
    line(""); line("  " + chalk.dim("type:  ") + chalk.white(op.isDir ? "directory" : "file"));
    if (undoable) { line(""); line("  " + chalk.green("↩ undo available") + chalk.dim("  —  press U to undo")); }
    else if (op.status === "done") { line(""); line("  " + chalk.dim("↩ undo not available") + chalk.dim("  (files may have moved or been deleted)")); }
    if (op.status === "error" && op.error) { line(""); line("  " + chalk.red("error: " + op.error)); }
    for (let i = ln; i < v; i++) out += at(start + i, 1) + clr();
    w(out);
  }

  function fullDraw(): void { drawNavbar([NAV()]); drawLogContent(); drawBottom(); }
  function onResize(): void { clearScreen(); adjustScroll(); fullDraw(); }
  function cleanup(): void {
    process.stdout.removeListener("resize", onResize);
    stdin.removeAllListeners("data");
    if (ownsAltScreen) { clearScreen(); exitAlt(); } else { w("\x1b[0m"); }
  }
  function exit(): void { cleanup(); setTimeout(onBack, 20); }

  function doSort(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showSortPicker("log", currentSort, R() - 2,
      (result) => { currentSort = result; applySort(); process.stdout.on("resize", onResize); fullDraw(); stdin.on("data", onKey); },
      () => { process.stdout.on("resize", onResize); fullDraw(); stdin.on("data", onKey); }
    );
  }

  function showConfirmDelete(targets: FileOp[]): void {
    const multi = targets.length > 1;
    const confirmNav: NavItem[] = [
      { key: "Y",     label: multi ? `Delete ${targets.length} entries` : "Delete Entry", color: "red"   },
      { key: "N/Esc", label: "Cancel", color: "green" },
    ];
    function drawConfirm(): void {
      const start = 3; const avail = R() - 3; const cols = C();
      drawNavbar([confirmNav]); let out = ""; let ln = 0;
      function line(s: string) { if (ln >= avail) return; out += at(start + ln, 1) + clr() + s; ln++; }
      if (multi) {
        line(chalk.bold(`  Delete ${targets.length} log entries`));
        line(chalk.dim("  (only removes entries from history — files are not affected)"));
        line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        for (const t of targets.slice(0, avail - 4)) line("  " + kindLabel(t.kind) + "  " + chalk.white(path.basename(t.srcPath)));
        if (targets.length > avail - 4) line(chalk.gray(`  ... and ${targets.length - (avail - 4)} more`));
      } else {
        const t = targets[0];
        line(chalk.bold("  Delete log entry"));
        line(chalk.dim("  (only removes the entry from history — files are not affected)"));
        line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        line("  " + kindLabel(t.kind) + "  " + chalk.white(path.basename(t.srcPath)));
        line("  " + chalk.dim("from: ") + chalk.white(homify(t.srcPath)));
        if (t.kind === "rename") line("  " + chalk.dim("to:   ") + chalk.white(t.destName));
        else line("  " + chalk.dim("to:   ") + chalk.white(homify(t.destPath)));
        line("  " + chalk.dim("time: ") + chalk.white(fmtTime(t.timestamp)));
      }
      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();
      w(out); drawBottomBar("Remove from log history?", "");
    }
    process.stdout.removeListener("resize", onResize);
    const onCR = () => { clearScreen(); drawConfirm(); };
    process.stdout.on("resize", onCR); stdin.removeListener("data", onKey);
    function onConfirm(k: string): void {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR);
        removeOpsFromLog(new Set(targets.map(t => t.id)));
        loadLog(); rawOps = getLog(); ops = sortLog(rawOps, currentSort);
        selected.clear(); sel = Math.min(sel, Math.max(0, ops.length - 1)); adjustScroll();
        process.stdout.on("resize", onResize); stdin.on("data", onKey); fullDraw(); return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR);
        process.stdout.on("resize", onResize); stdin.on("data", onKey); fullDraw();
      }
    }
    stdin.on("data", onConfirm); clearScreen(); drawConfirm();
  }

  function showUndoError(errMsg: string): void {
    const errorNav: NavItem[] = [{ key: "Esc", label: "Back", color: "green" }];
    function drawError(): void {
      const start = 3; const avail = R() - 3;
      drawNavbar([errorNav]); let out = ""; let ln = 0;
      function line(s: string) { if (ln >= avail) return; out += at(start + ln, 1) + clr() + s; ln++; }
      line(chalk.red.bold("  Undo failed")); line(chalk.dim("─".repeat(Math.min(C() - 2, 60)))); line("  " + chalk.red(errMsg));
      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();
      w(out); drawBottomBar("Undo error", "");
    }
    process.stdout.removeListener("resize", onResize);
    const onER = () => { clearScreen(); drawError(); };
    process.stdout.on("resize", onER); stdin.removeListener("data", onKey);
    function onErrKey(k: string): void {
      if (k === "\u001b" || k === "\u0003" || k === "\r") {
        stdin.removeListener("data", onErrKey); process.stdout.removeListener("resize", onER);
        process.stdout.on("resize", onResize); stdin.on("data", onKey); fullDraw();
      }
    }
    stdin.on("data", onErrKey); clearScreen(); drawError();
  }

  function showUndoConfirm(op: FileOp): void {
    const undoable  = canUndo(op);
    const undoDesc  = (() => {
      if (op.kind === "copy")                      return `Delete copy at: ${homify(op.destPath)}`;
      if (op.kind === "move" || op.kind === "cut") return `Move back to: ${homify(op.srcPath)}`;
      if (op.kind === "rename")                    return `Rename back to: ${op.srcName}`;
      return "Undo operation";
    })();
    const confirmNav: NavItem[] = undoable
      ? [{ key: "Y", label: "Confirm Undo", color: "yellow" }, { key: "N/Esc", label: "Cancel", color: "green" }]
      : [{ key: "Esc", label: "Back", color: "green" }];
    function drawConfirm(): void {
      const start = 3; const avail = R() - 3; const cols = C();
      drawNavbar([confirmNav]); let out = ""; let ln = 0;
      function line(s: string) { if (ln >= avail) return; out += at(start + ln, 1) + clr() + s; ln++; }
      if (!undoable) {
        line(chalk.red.bold("  Cannot undo this operation")); line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        line("  " + chalk.dim("Files may have been moved, renamed, or deleted since this operation.")); line("");
        line("  " + chalk.dim("operation: ") + chalk.white(op.kind.toUpperCase()));
        line("  " + chalk.dim("from:      ") + chalk.white(homify(op.srcPath)));
        if (op.kind === "rename") line("  " + chalk.dim("to:        ") + chalk.white(op.destName));
        else line("  " + chalk.dim("to:        ") + chalk.white(homify(op.destPath)));
      } else {
        line(chalk.yellow.bold("  Undo: " + op.kind.toUpperCase())); line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        line("  " + chalk.dim("what will happen:")); line("  " + chalk.white(undoDesc)); line("");
        line("  " + chalk.dim("original operation:"));
        line("  " + chalk.dim("from: ") + chalk.white(homify(op.srcPath)));
        if (op.kind === "rename") line("  " + chalk.dim("to:   ") + chalk.white(op.destName));
        else line("  " + chalk.dim("to:   ") + chalk.white(homify(op.destPath)));
        if (op.kind === "copy") { line(""); line("  " + chalk.yellow("warning: this will permanently delete the copied file/folder")); }
      }
      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();
      w(out); drawBottomBar(undoable ? "Undo operation?" : "Undo not available", "");
    }
    process.stdout.removeListener("resize", onResize);
    const onCR = () => { clearScreen(); drawConfirm(); };
    process.stdout.on("resize", onCR); stdin.removeListener("data", onKey);
    function onConfirm(k: string): void {
      if (!undoable) {
        if (k === "\u001b" || k === "\u0003" || k === "n" || k === "N" || k === "\r") {
          stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR);
          process.stdout.on("resize", onResize); stdin.on("data", onKey); fullDraw();
        }
        return;
      }
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR);
        const err = performUndo(op);
        if (!err) {
          removeOpFromLog(op.id); loadLog(); rawOps = getLog();
          ops = sortLog(rawOps, currentSort); selected.clear();
          sel = Math.min(sel, Math.max(0, ops.length - 1)); adjustScroll();
        }
        process.stdout.on("resize", onResize); stdin.on("data", onKey);
        if (err) showUndoError(err); else fullDraw(); return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") {
        stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR);
        process.stdout.on("resize", onResize); stdin.on("data", onKey); fullDraw();
      }
    }
    stdin.on("data", onConfirm); clearScreen(); drawConfirm();
  }

  function showDetail(op: FileOp): void {
    const detailNav: NavItem[] = [
      { key: "U",   label: "Undo",         color: canUndo(op) ? "yellow" : "default" },
      { key: "X",   label: "Delete Entry", color: "red" },
      { key: "Esc", label: "Back" },
    ];
    process.stdout.removeListener("resize", onResize);
    const onDR = () => { clearScreen(); drawNavbar([detailNav]); drawDetailContent(op); drawBottomBar(op.kind.toUpperCase(), ""); };
    process.stdout.on("resize", onDR);
    function onDetailKey(k: string): void {
      if (k === "\u0003") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); cleanup(); setTimeout(onBack, 20); return; }
      if (k === "\u001b" || k === "q") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); process.stdout.on("resize", onResize); clearScreen(); fullDraw(); stdin.on("data", onKey); return; }
      if (k === "u" || k === "U") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); showUndoConfirm(op); return; }
      if (k === "x" || k === "X") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); showConfirmDelete([op]); return; }
    }
    stdin.removeListener("data", onKey); stdin.on("data", onDetailKey);
    clearScreen(); drawNavbar([detailNav]); drawDetailContent(op); drawBottomBar(op.kind.toUpperCase(), "");
  }

  function onKey(raw: string): void {
    if (raw === "\u001b[A") { if (sel > 0) { sel--; adjustScroll(); fullDraw(); } return; }
    if (raw === "\u001b[B") { if (sel < ops.length - 1) { sel++; adjustScroll(); fullDraw(); } return; }
    if (raw === "\u0003") { exit(); return; }
    if (raw === "\u001b") { if (selected.size > 0) { selected.clear(); fullDraw(); } else exit(); return; }
    if (raw === "q") { exit(); return; }
    if (raw.startsWith("\u001b")) return;
    if (raw === " ")             { toggleSelect(); fullDraw(); return; }
    if (raw === "a")             { selectAll();   fullDraw(); return; }
    if (raw === "s")             { doSort(); return; }
    if (raw === "x" || raw === "X") { const t = getTargets(); if (t.length) showConfirmDelete(t); return; }
    if (raw === "u" || raw === "U") { if (ops.length) showUndoConfirm(ops[sel]); return; }
    if (raw === "\r" && ops.length > 0) { showDetail(ops[sel]); return; }
  }

  process.stdout.on("resize", onResize);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  if (ownsAltScreen) enterAlt();
  clearScreen(); fullDraw();
}

export function showFileOpsLog(onBack: () => void): void { runLogPanel(process.stdin, onBack, true); }
export function openFileOpsLogFromMain(onBack: () => void): void { runLogPanel(process.stdin, onBack, true); }