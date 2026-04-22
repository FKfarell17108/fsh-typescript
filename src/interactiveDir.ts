import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execFileSync } from "child_process";
import { moveToTrash } from "./trash";
import { w, at, clr, C, R, drawNavbar, NavItem, NavRows, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";
import { getClipboard, setClipboard, clearClipboard, execCopy, execMove, execRename, uniqueDest, loadLog } from "./fileOps";
import { showFileOpsLog } from "./fileOpsLog";
import { showInlineInput, showEditorPickerStandalone, LsResult } from "./interactiveLs";
import { loadBookmarks, toggleBookmark, isBookmarked } from "./bookmarks";
import { showBookmarkPicker } from "./bookmarkPicker";
import {
  LsSort, DEFAULT_LS_SORT, lsSortLabel,
  sortDirEntriesWithStat, showSortPicker,
} from "./sort";
import {
  PreviewPref, PreviewState,
  getPreviewMode, listCols,
  makePreviewState, updatePreview, forceUpdatePreview, scrollPreview,
  drawSplitPreview, drawOverlayPreview,
  getDirEntries, getMetaLineCount,
  SPLIT_THRESHOLD, OVERLAY_LINES, previewLineColor,
  openImageWithFeh, closeImagePreview,
} from "./preview";
import { getGitDirStatus } from "./git";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "tiff", "tif"]);
const VIDEO_EXTS = new Set(["mp4", "mkv", "webm", "mov", "avi", "flv", "wmv", "m4v"]);

function readImageDimensions(fullPath: string): { width: number; height: number } | null {
  try {
    const buf = fs.readFileSync(fullPath);
    if (buf.length < 24) return null;
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      let i = 3;
      while (i < buf.length - 1) {
        if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        if (buf[i] !== 0xff) { i++; continue; }
        const len = buf.readUInt16BE(i + 2); if (len < 2) break; i += 2 + len;
      }
    }
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf[0] === 0x42 && buf[1] === 0x4d) return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
  } catch { }
  return null;
}

function readVideoDimensions(fullPath: string): { width: number; height: number } | null {
  try {
    const out = String(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", fullPath], { encoding: "utf8" })).trim();
    const m = out.match(/^(\d+)x(\d+)$/);
    if (!m) return null;
    return { width: Number(m[1]), height: Number(m[2]) };
  } catch { return null; }
}

type ActionKind = "copy" | "cut" | "move" | "rename" | "paste" | null;

function actionColor(kind: ActionKind): (s: string) => string {
  switch (kind) {
    case "copy": return chalk.hex("#56D4D4");
    case "cut": return chalk.hex("#FFD580");
    case "move": return chalk.hex("#FFA878");
    case "rename": return chalk.hex("#D4A9F5");
    case "paste": return chalk.hex("#AEDD87");
    default: return chalk.white;
  }
}

function actionLabel(kind: ActionKind, name: string): string {
  if (!kind) return "";
  return actionColor(kind)(`${kind.charAt(0).toUpperCase() + kind.slice(1)}: `) + chalk.white(name);
}

function cellActionStyle(kind: ActionKind, cell: string, hidden: boolean): string {
  switch (kind) {
    case "copy": return chalk.hex("#56D4D4").underline(cell);
    case "cut": return chalk.hex("#FFD580").underline(cell);
    case "move": return chalk.hex("#FFA878").bold(cell);
    default: return hidden ? chalk.cyan(cell) : chalk.blue.bold(cell);
  }
}

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function interactiveDir(onExit: (result: LsResult) => void): void {
  let cwd = process.cwd(); loadLog(); loadBookmarks();

  function loadDirs(dir: string): { name: string; hidden: boolean }[] {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => { try { return e.isDirectory() || (e.isSymbolicLink() && fs.statSync(path.join(dir, e.name)).isDirectory()); } catch { return false; } })
        .map(e => ({ name: e.name, hidden: e.name.startsWith(".") }));
    } catch { return []; }
  }

  let allEntries = loadDirs(cwd);
  let showHidden = false;
  let currentSort: LsSort = { ...DEFAULT_LS_SORT };

  let searchActive = false;
  let searchQuery = "";

  const visibleEntries = () => {
    const base = showHidden ? allEntries : allEntries.filter(e => !e.hidden);
    return sortDirEntriesWithStat(base, currentSort, cwd);
  };

  let entries = visibleEntries();

  if (!process.stdin.isTTY) { console.log(entries.map(e => e.name + "/").join("  ")); return onExit({ kind: "quit" }); }
  if (allEntries.length === 0) { console.log(chalk.gray("(no subdirectories)")); return onExit({ kind: "quit" }); }
  if (entries.length === 0 && allEntries.length > 0) { showHidden = true; entries = visibleEntries(); }
  if (entries.length === 0) { console.log(chalk.gray("(no subdirectories)")); return onExit({ kind: "quit" }); }

  const stdin = process.stdin;
  let selIdx = 0; let scrollTop = 0;
  let selected = new Set<string>();
  let statusMsg = ""; let statusTimer: ReturnType<typeof setTimeout> | null = null;

  let previewPref: PreviewPref = "auto";
  const pvState: PreviewState = makePreviewState();

  let browseMode = false;
  let browseIdx = 0;
  let browseStack: { path: string; idx: number; scrollTop: number }[] = [];
  let fehOpen = false;

  let moveModePending: { srcPaths: string[]; srcNames: string[]; label: string } | null = null;

  function isSplit(): boolean { return getPreviewMode(previewPref) === "split"; }
  function effectiveListW(): number { return isSplit() ? listCols() : C(); }

  function scanRecursive(dir: string, depth: number): { name: string; hidden: boolean; relPath: string }[] {
    if (depth > 4) return [];
    const SKIP = new Set(["node_modules", ".git", ".svn", "dist", "build", "out", ".next", "__pycache__", ".cache"]);
    const results: { name: string; hidden: boolean; relPath: string }[] = [];
    try {
      const ents = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of ents) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        let isDir = false;
        try { isDir = e.isDirectory() || (e.isSymbolicLink() && fs.statSync(full).isDirectory()); } catch { }
        if (!isDir) continue;
        const relPath = path.relative(cwd, full);
        if (relPath.startsWith("..")) continue;
        results.push({ name: e.name, hidden: e.name.startsWith("."), relPath });
        if (!SKIP.has(e.name)) results.push(...scanRecursive(full, depth + 1));
      }
    } catch { }
    return results;
  }

  function runSearch(query: string): { name: string; hidden: boolean }[] {
    if (!query) return [];
    const all = scanRecursive(cwd, 0);
    return all
      .filter(e => fuzzyMatch(query, e.name))
      .slice(0, 200)
      .map(e => ({ name: e.relPath, hidden: e.hidden }));
  }

  function getActiveEntries(): { name: string; hidden: boolean }[] {
    if (searchQuery) return runSearch(searchQuery);
    return visibleEntries();
  }

  function reloadEntries(newCwd?: string, restoreName?: string): void {
    if (newCwd) cwd = newCwd;
    allEntries = loadDirs(cwd);
    if (searchQuery) {
      entries = runSearch(searchQuery);
    } else {
      entries = visibleEntries();
      if (!entries.length && allEntries.length) { showHidden = true; entries = visibleEntries(); }
    }
    selIdx = 0; scrollTop = 0;
    if (restoreName) { const idx = entries.findIndex(e => e.name === restoreName); if (idx >= 0) selIdx = idx; }
    adjustScroll(); refreshPreview();
  }

  function refreshPreview(): void {
    if (!entries.length) { pvState.path = ""; pvState.content = null; return; }
    const fullPath = path.join(cwd, entries[selIdx].name);
    updatePreview(pvState, fullPath);
  }

  function togglePreviewPref(): void {
    const mode = getPreviewMode(previewPref);
    previewPref = mode === "split"
      ? (C() >= SPLIT_THRESHOLD ? "overlay" : "auto")
      : (C() >= SPLIT_THRESHOLD ? "split" : "auto");
  }

  function getActiveActionLabel(): string {
    const cb = getClipboard() as any;
    if (moveModePending) return actionLabel("move", moveModePending.label);
    if (cb) return actionLabel(cb.kind as ActionKind, cb.srcName.slice(0, 25));
    return "";
  }

  function isItemActive(name: string): ActionKind {
    const cb = getClipboard() as any;
    if (moveModePending && moveModePending.srcNames.includes(name)) return "move";
    if (cb) {
      if (cb.items) { if (cb.items.some((it: any) => it.srcPath === path.join(cwd, name))) return cb.kind as ActionKind; }
      else { if (cb.srcPath === path.join(cwd, name)) return cb.kind as ActionKind; }
    }
    return null;
  }

  function NR(): number { return browseMode ? 2 : moveModePending ? 2 : 3; }

  function NAV(): NavRows {
    const cb = getClipboard() as any;
    const mode = getPreviewMode(previewPref);
    if (browseMode) {
      const be = getDirEntries(pvState.content ?? { kind: "empty" } as any);
      const curBrowseEntry = be[browseIdx];
      const entLabelBrowse = !curBrowseEntry
        ? "Open/Enter"
        : curBrowseEntry.isDir
          ? "Enter"
          : "Open";
      return [[
        { key: "Nav", label: "Navigate" },
        { key: "Ent", label: entLabelBrowse },
        { key: "Tab", label: "Parent" },
        { key: "Esc", label: "Back" },
      ]];
    }
    if (moveModePending) {
      return [[
        { key: "Nav", label: "Navigate" },
        { key: "Ent", label: "Enter Dir" },
        { key: "Tab", label: "Parent" },
        { key: ".", label: showHidden ? "Hide Hidden" : "Show Hidden" },
      ]];
    }
    const oLabel = pvState.content?.kind === "dir" ? "Browse" : "Preview";
    return [
      [
        { key: "Nav", label: "Navigate" },
        { key: "Spc", label: "Select" },
        { key: "A", label: "All" },
        { key: "Ent", label: "Enter" },
        { key: "Tab", label: "Parent" },
        { key: "O", label: oLabel },
        { key: "P", label: mode === "split" ? "Overlay" : "Split" },
        { key: "Esc", label: cb ? "Cancel Clip" : selected.size > 0 ? "Deselect" : "Quit" },
      ],
      [
        { key: "C", label: "Copy" },
        { key: "X", label: "Cut" },
        { key: "V", label: "Paste" },
        { key: "R", label: "Rename" },
        { key: "M", label: "Move" },
        { key: "D", label: "Delete" },
        { key: "H", label: "History" },
        { key: ".", label: showHidden ? "Hide Hidden" : "Show Hidden" },
      ],
    ];
  }

  function enterBrowse(): void {
    if (!pvState.content || pvState.content.kind !== "dir") return;
    browseMode = true; browseIdx = 0;
    browseStack = [{ path: pvState.path, idx: 0, scrollTop: pvState.scrollTop }];
    syncBrowseScroll(); clearScreen(); render();
  }

  function exitBrowse(): void {
    if (fehOpen) { closeImagePreview(); fehOpen = false; }
    browseMode = false; browseIdx = 0; browseStack = []; pvState.scrollTop = 0;
    clearScreen(); render();
  }

  function syncBrowseScroll(): void {
    const metaLines = getMetaLineCount(pvState.content!);
    const totalOffset = 1 + metaLines;
    const visH = isSplit() ? Math.max(1, R() - NR() - 3 - 1) : Math.max(1, OVERLAY_LINES - 1);
    const targetLine = totalOffset + browseIdx;
    if (targetLine < pvState.scrollTop) pvState.scrollTop = targetLine;
    if (targetLine >= pvState.scrollTop + visH) pvState.scrollTop = targetLine - visH + 1;
  }

  function browseNavigate(delta: number): void {
    const be = getDirEntries(pvState.content!); if (!be.length) return;
    browseIdx = Math.max(0, Math.min(be.length - 1, browseIdx + delta));
    syncBrowseScroll(); renderPreview(); drawBottom();
    drawNavbar(NAV());
  }

  function browseEnter(): void {
    const be = getDirEntries(pvState.content!); if (!be.length) return;
    const entry = be[browseIdx];
    const resolvedFull = path.join(pvState.path, entry.name);
    if (entry.isDir) {
      browseStack.push({ path: pvState.path, idx: browseIdx, scrollTop: pvState.scrollTop });
      forceUpdatePreview(pvState, resolvedFull);
      browseIdx = 0; syncBrowseScroll(); renderPreview(); drawBottom();
      drawNavbar(NAV());
    } else {
      const ext = path.extname(resolvedFull).slice(1).toLowerCase();
      if (IMAGE_EXTS.has(ext)) {
        openImageWithFeh(resolvedFull);
        fehOpen = true;
        drawNavbar(NAV());
        drawBottom();
        return;
      }
      showEditorPickerStandalone(
        resolvedFull, stdin, onResize, onKey,
        render, fullRedraw,
        () => { process.chdir(cwd); exit(); },
        (ed, f) => {
          browseMode = false;
          browseIdx = 0;
          browseStack = [];
          pvState.scrollTop = 0;

          const targetDir = path.dirname(f);
          cwd = targetDir;
          process.chdir(cwd);

          cleanup();
          setTimeout(() => onExit({ kind: "open", editor: ed, file: f }), 50);
        },
        () => { },
      );
    }
  }

  function browseParent(): void {
    if (browseStack.length <= 1) { exitBrowse(); return; }
    const prev = browseStack.pop()!;
    const parentFrame = browseStack[browseStack.length - 1];
    forceUpdatePreview(pvState, parentFrame.path);
    browseIdx = prev.idx; pvState.scrollTop = prev.scrollTop;
    syncBrowseScroll(); renderPreview(); drawBottom();
    drawNavbar(NAV());
  }

  function cw(): number {
    const lw = effectiveListW();
    if (!entries.length) return 16;
    return Math.min(Math.max(...entries.map(e => e.name.length + 1)) + 4, Math.floor(lw / 2));
  }
  function pr(): number { return Math.max(1, Math.floor(effectiveListW() / cw())); }
  function tr(): number { return Math.ceil(entries.length / pr()); }
  function vis(): number {
    const base = Math.max(1, R() - NR() - 3);
    if (!isSplit() && pvState.content) return Math.max(1, base - 14);
    return base;
  }
  function adjustScroll(): void {
    const row = Math.floor(selIdx / pr()); const v = vis();
    if (row < scrollTop) scrollTop = row;
    if (row >= scrollTop + v) scrollTop = row - v + 1;
  }

  function navigate(key: string): boolean {
    const p = pr(); const total = entries.length; if (!total) return false;
    const curRow = Math.floor(selIdx / p); const curCol = selIdx % p; let next = selIdx;
    if (key === "\u001b[A") { if (curRow === 0) return false; next = (curRow - 1) * p + curCol; if (next >= total) next = total - 1; }
    else if (key === "\u001b[B") { if (curRow >= tr() - 1) return false; next = (curRow + 1) * p + curCol; if (next >= total) next = total - 1; }
    else if (key === "\u001b[D") { if (curCol === 0) { if (curRow === 0) return false; next = (curRow - 1) * p + Math.min(p - 1, total - 1 - (curRow - 1) * p); } else next = selIdx - 1; }
    else if (key === "\u001b[C") { if (selIdx >= total - 1) return false; if (curCol >= p - 1 || selIdx + 1 >= total) { const ns = (curRow + 1) * p; if (ns >= total) return false; next = ns; } else next = selIdx + 1; }
    else if (key === "\u001b[H") { next = 0; }
    else if (key === "\u001b[F") { next = total - 1; }
    else return false;
    next = Math.max(0, Math.min(total - 1, next));
    if (next === selIdx) return false;
    selIdx = next; adjustScroll(); refreshPreview(); return true;
  }

  function toggleSelect(): void { if (!entries.length) return; const n = entries[selIdx].name; if (selected.has(n)) selected.delete(n); else selected.add(n); }
  function selectAll(): void { if (selected.size === entries.length) selected.clear(); else selected = new Set(entries.map(e => e.name)); }
  function getTargets() { if (selected.size > 0) return entries.filter(e => selected.has(e.name)); return entries.length ? [entries[selIdx]] : []; }

  function buildGitStatus(): string {
    const targetDir = (() => {
      if (entries.length) {
        return path.join(cwd, entries[selIdx].name);
      }
      return cwd;
    })();
    const gs = getGitDirStatus(targetDir);
    if (gs.kind === "none") return chalk.red("no git");
    let branchColor = chalk.green;
    const b = gs.branch.toLowerCase();
    if (b === "main" || b === "master") {
      branchColor = chalk.hex("#FFD580");
    } else if (b === "dev" || b === "develop") {
      branchColor = chalk.cyan;
    }
    const repoPart = chalk.hex("#AEDD87")(`git: ${gs.repoName}`);
    const branchPart = chalk.white.bold(" (") + branchColor.bold(gs.branch) + chalk.white.bold(")");
    return repoPart + branchPart;
  }

  function buildLeft(): string {
    const home = process.env.HOME ?? "";
    const rel = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
    const hidC = allEntries.filter(e => e.hidden).length;
    let s = chalk.dim(rel);
    s += chalk.dim(`  ${entries.length}d`);
    if (!showHidden && hidC) s += chalk.dim(`  ${hidC} hidden`);
    if (selected.size) s += chalk.magenta(`  ${selected.size} sel`);
    if (searchQuery) s += chalk.cyan(`  /${searchQuery}`);
    const al = getActiveActionLabel();
    if (al) s += "    " + al;
    s += "    " + buildGitStatus();
    return s;
  }

  function buildRight(): string {
    const mode = getPreviewMode(previewPref);
    const modeStr = browseMode
      ? chalk.cyan(" [browse]")
      : chalk.dim(mode === "split" ? " [split]" : " [overlay]");
    const pgHint = pvState.content
      ? "  " + chalk.white.bold("[") + chalk.cyan.bold("PgUp/PgDn") + chalk.white.bold("]") + chalk.dim(" Scroll")
      : "";
    const total = entries.length;
    const v = vis();
    if (tr() <= v) return pgHint + modeStr;
    const more = tr() - (scrollTop + v);
    const moreStr = more > 0 ? chalk.dim(`↓ ${more} more`) : chalk.dim("end");
    return moreStr + pgHint + modeStr;
  }

  function drawMiniBar(): void {
    if (browseMode || moveModePending) { w(at(R() - 1, 1) + "\x1b[2K\x1b[0m"); return; }
    const cols = C();

    if (searchActive) {
      const line = "  " + chalk.bgBlack.cyan.bold(" search ") + " " + chalk.white(searchQuery) + chalk.dim("█") + "    " + chalk.dim("Esc") + chalk.dim(" clear  ") + chalk.dim("Enter") + chalk.dim(" confirm");
      w(at(R() - 1, 1) + "\x1b[2K\x1b[0m" + line + " ".repeat(Math.max(0, cols - visibleLen(line))));
      return;
    }

    const searchHint = searchQuery
      ? chalk.white("[") + chalk.cyan.bold("/") + chalk.white("]") + " " + chalk.cyan.bold(searchQuery)
      : chalk.white("[") + chalk.cyan.bold("/") + chalk.white("]") + chalk.dim(" Search");

    const line =
      "  " + chalk.white("[") + chalk.cyan.bold("N") + chalk.white("]") + chalk.dim(" New Folder") +
      "    " + chalk.white("[") + chalk.cyan.bold("S") + chalk.white("]") + chalk.dim(" Sort: ") + chalk.cyan(lsSortLabel(currentSort)) +
      "    " + chalk.white("[") + chalk.cyan.bold("B") + chalk.white("]") + chalk.dim(" Bookmark") +
      "    " + searchHint;
    const vl = visibleLen(line);
    w(at(R() - 1, 1) + "\x1b[2K\x1b[0m" + line + (vl < cols ? " ".repeat(cols - vl) : ""));
  }

  function drawMoveConfirmBar(): void {
    if (!moveModePending) return;
    const cols = C();
    const line = chalk.hex("#FFA878").bold("  Move ") + chalk.white(moveModePending.label) +
      "  " + chalk.bgGreen.black.bold(" Y ") + chalk.white(" Move Here") +
      "  " + chalk.bgRed.white.bold(" Esc ") + chalk.white(" Cancel");
    const vl = visibleLen(line);
    w(at(R() - 1, 1) + "\x1b[2K\x1b[0m");
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + line + (vl < cols ? " ".repeat(cols - vl) : ""));
  }

  function drawBottom(): void {
    if (statusMsg) { w(at(R(), 1) + "\x1b[2K\x1b[0m" + statusMsg); return; }
    drawMiniBar();
    const cols = C();
    const ls = "  " + buildLeft();
    const rs = buildRight() ? buildRight() + "  " : "";
    const gap = Math.max(0, cols - visibleLen(ls) - visibleLen(rs));

    w(at(R(), 1) + "\x1b[2K\x1b[0m" + ls + " ".repeat(gap) + rs);
  }

  function showStatus(msg: string, isErr = false): void {
    if (statusTimer) clearTimeout(statusTimer);
    statusMsg = isErr ? chalk.red(msg) : chalk.green(msg);
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + statusMsg);
    statusTimer = setTimeout(() => { statusMsg = ""; drawBottom(); statusTimer = null; }, 2000);
  }

  function drawContent(): void {
    const lw = effectiveListW();
    const start = NR() + 2; const p = pr(); const cWidth = cw(); const v = vis();
    let out = "";
    if (!entries.length) {
      const msg = searchQuery
        ? chalk.dim(`  no results for "`) + chalk.white(searchQuery) + chalk.dim('"')
        : chalk.dim("  (no subdirectories)");
      out += at(start, 1) + "\x1b[2K" + msg;
      for (let row = 1; row < v; row++) out += at(start + row, 1) + "\x1b[2K";
      w(out); return;
    }
    for (let row = 0; row < v; row++) {
      const fr = scrollTop + row;
      let visCount = 0; let line = " "; visCount += 1;
      for (let col = 0; col < p; col++) {
        const i = fr * p + col; if (i >= entries.length) break;
        const { name, hidden } = entries[i];
        const isCursor = i === selIdx; const isSel = selected.has(name);
        const itemAction = isItemActive(name);
        const dispName = name + "/";
        const prefix = isSel ? "✓ " : "  ";
        const maxNameW = Math.min(cWidth, lw - visCount) - prefix.length;
        if (maxNameW <= 0) break;
        const truncDisp = dispName.length > maxNameW ? dispName.slice(0, maxNameW - 1) + "…" : dispName;
        const cell = (prefix + truncDisp).padEnd(cWidth, " ").slice(0, cWidth);
        if (visCount + cWidth > lw) break;
        if (isCursor && isSel) line += chalk.bgMagenta.white.bold(cell);
        else if (isCursor) line += chalk.bgWhite.black.bold(cell);
        else if (isSel) line += chalk.magenta.bold(cell);
        else if (itemAction) line += cellActionStyle(itemAction, cell, hidden);
        else if (isBookmarked(path.join(cwd, name))) line += hidden ? chalk.hex("#FFD580")(cell) : chalk.hex("#FFD580").bold(cell);
        else if (hidden) line += chalk.cyan(cell);
        else line += chalk.blue.bold(cell);
        visCount += cWidth;
      }
      out += at(start + row, 1) + "\x1b[2K" + line + " ".repeat(Math.max(0, lw - visCount));
    }
    w(out);
  }

  function renderPreview(): void {
    if (!entries.length) {
      pvState.path = "";
      pvState.content = null;
      return;
    }

    if (!browseMode) {
      const targetPath = path.join(cwd, entries[selIdx].name);
      updatePreview(pvState, targetPath);
    }

    const bIdx = browseMode ? browseIdx : undefined;
    if (isSplit()) {
      drawSplitPreview(pvState, NR(), effectiveListW(), bIdx);
    } else {
      drawOverlayPreview(pvState, NR(), bIdx);
    }
  }

  function render(): void { drawNavbar(NAV()); drawContent(); renderPreview(); drawBottom(); }
  function fullRedraw(): void { clearScreen(); adjustScroll(); render(); }
  function cleanup(): void { process.stdout.removeListener("resize", onResize); stdin.removeAllListeners("data"); exitAlt(); }
  function exit(): void { process.chdir(cwd); cleanup(); setTimeout(() => onExit({ kind: "quit" }), 50); }

  function buildMultiClip(kind: "copy" | "cut") {
    const targets = getTargets();
    const items = targets.map(t => ({ srcPath: path.join(cwd, t.name), srcName: t.name, isDir: true }));
    return { kind, srcPath: items[0].srcPath, srcName: items.length === 1 ? items[0].srcName : `${items.length} dirs`, isDir: true, items };
  }

  function doCopy(): void { const t = getTargets(); if (!t.length) return; setClipboard(buildMultiClip("copy") as any); selected.clear(); render(); }
  function doCut(): void { const t = getTargets(); if (!t.length) return; setClipboard(buildMultiClip("cut") as any); selected.clear(); render(); }

  function doPaste(): void {
    const cb = getClipboard() as any; if (!cb) { showStatus("  nothing in clipboard", true); return; }
    const items: { srcPath: string; srcName: string; isDir: boolean }[] = cb.items ?? [{ srcPath: cb.srcPath, srcName: cb.srcName, isDir: cb.isDir }];
    let errors = 0;
    for (const item of items) { const err = cb.kind === "copy" ? execCopy(item.srcPath, uniqueDest(cwd, item.srcName)) : execMove(item.srcPath, uniqueDest(cwd, item.srcName)); if (err) errors++; }
    if (cb.kind === "cut") clearClipboard(); selected.clear();
    if (errors > 0) showStatus(`  ${errors} error(s) during paste`, true);
    else showStatus(`  ${cb.kind === "copy" ? "Copied" : "Moved"}: ${items.length} item${items.length > 1 ? "s" : ""}`);
    reloadEntries(); render();
  }

  function doMoveInit(): void {
    const targets = getTargets(); if (!targets.length) return;
    const items = targets.map(t => ({ srcPath: path.join(cwd, t.name), srcName: t.name }));
    const label = items.length === 1 ? items[0].srcName + "/" : `${items.length} dirs`;
    moveModePending = { srcPaths: items.map(i => i.srcPath), srcNames: items.map(i => i.srcName), label };
    selected.clear(); clearClipboard(); fullRedraw();
  }

  function doMoveConfirm(): void {
    if (!moveModePending) return;
    const { srcPaths, srcNames } = moveModePending;
    let errors = 0;
    for (let i = 0; i < srcPaths.length; i++) { const err = execMove(srcPaths[i], uniqueDest(cwd, srcNames[i])); if (err) errors++; }
    const label = moveModePending.label; moveModePending = null;
    if (errors > 0) showStatus(`  ${errors} error(s) during move`, true);
    else { const home = process.env.HOME ?? ""; showStatus(`  Moved: ${label}  →  ${cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd}`); }
    reloadEntries(); fullRedraw();
  }

  function doRename(): void {
    if (!entries.length) return;
    if (selected.size > 1) { showStatus("  rename: select one item at a time", true); return; }
    const e = entries[selIdx]; const full = path.join(cwd, e.name);
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showInlineInput(stdin, "Rename:", e.name,
      (newName) => {
        process.stdout.on("resize", onResize);
        if (!newName || newName === e.name) { fullRedraw(); stdin.on("data", onKey); return; }
        if (fs.existsSync(path.join(cwd, newName))) { showStatus(`  '${newName}' already exists`, true); fullRedraw(); stdin.on("data", onKey); return; }
        const err = execRename(full, newName);
        if (err) showStatus("  Error: " + err, true); else showStatus(`  Renamed: ${e.name}/  →  ${newName}/`);
        selected.clear(); reloadEntries(undefined, newName); fullRedraw(); stdin.on("data", onKey);
      },
      () => { process.stdout.on("resize", onResize); fullRedraw(); stdin.on("data", onKey); }
    );
  }

  function doMkdir(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showInlineInput(stdin, "New folder:", "",
      (name) => {
        process.stdout.on("resize", onResize);
        if (!name) { fullRedraw(); stdin.on("data", onKey); return; }
        const full = path.join(cwd, name);
        if (fs.existsSync(full)) { showStatus(`  '${name}' already exists`, true); fullRedraw(); stdin.on("data", onKey); return; }
        try {
          fs.mkdirSync(full, { recursive: true });
          allEntries = loadDirs(cwd); entries = searchQuery ? runSearch(searchQuery) : visibleEntries();
          const idx = entries.findIndex(e => e.name === name);
          selIdx = idx >= 0 ? idx : Math.min(selIdx, Math.max(0, entries.length - 1));
          adjustScroll(); refreshPreview(); showStatus(`  Created folder: ${name}/`); fullRedraw();
        } catch (e: any) { showStatus("  Error: " + e.message, true); fullRedraw(); }
        stdin.on("data", onKey);
      },
      () => { process.stdout.on("resize", onResize); fullRedraw(); stdin.on("data", onKey); }
    );
  }

  function goUp(): void {
    const parent = path.dirname(cwd); if (parent === cwd) return;
    const prev = path.basename(cwd);
    searchQuery = ""; searchActive = false;
    reloadEntries(parent, prev);
    if (!entries.length) { process.chdir(cwd); return exit(); }
    render();
  }

  function goInto(name: string): void {
    searchQuery = ""; searchActive = false;
    reloadEntries(path.join(cwd, name));
    if (!entries.length) { process.chdir(cwd); return exit(); }
    render();
  }

  function toggleHidden(): void {
    const prev = entries[selIdx]?.name; showHidden = !showHidden;
    entries = searchQuery ? runSearch(searchQuery) : visibleEntries();
    selIdx = 0; scrollTop = 0;
    if (prev) { const idx = entries.findIndex(e => e.name === prev); if (idx >= 0) selIdx = idx; }
    adjustScroll(); refreshPreview(); render();
  }

  function openSearch(): void {
    searchActive = true;
    drawMiniBar();
  }

  function handleSearchKey(key: string): void {
    if (key === "\u001b" || key === "\u0003") {
      searchActive = false;
      if (searchQuery) { searchQuery = ""; reloadEntries(); }
      fullRedraw();
      return;
    }
    if (key === "\r") {
      searchActive = false;
      fullRedraw();
      return;
    }
    if (key === "\x7f" || key === "\u0008") {
      if (searchQuery.length > 0) {
        searchQuery = searchQuery.slice(0, -1);
        entries = searchQuery ? runSearch(searchQuery) : visibleEntries();
        selIdx = 0; scrollTop = 0; adjustScroll(); refreshPreview();
        drawNavbar(NAV()); drawContent(); renderPreview(); drawBottom();
      }
      return;
    }
    if (navigate(key)) { drawContent(); renderPreview(); drawBottom(); return; }
    if (key.length === 1 && key >= " ") {
      searchQuery += key;
      entries = runSearch(searchQuery);
      selIdx = 0; scrollTop = 0; adjustScroll(); refreshPreview();
      drawNavbar(NAV()); drawContent(); renderPreview(); drawBottom();
      return;
    }
  }

  function showDeleteConfirm(): void {
    const targets = getTargets();
    if (!targets.length) return;
    const multi = targets.length > 1;
    const single = !multi ? targets[0] : null;
    const singleExt = single ? path.extname(single.name).slice(1).toLowerCase() : "";
    const singleIsVideo = !!single && VIDEO_EXTS.has(singleExt);
    const allowBrowse = !!single;

    function buildDeleteBodyLines(innerW: number, maxLines: number): string[] {
      const lines: string[] = [];
      const push = (s: string) => { if (lines.length < maxLines) lines.push(s); };

      if (multi) {
        push(chalk.bold.white(padOrTrim(`Move ${targets.length} dirs to trash?`, innerW)));
        const remaining = maxLines - lines.length;
        if (remaining <= 0) return lines;
        if (targets.length <= remaining) {
          for (const t of targets) push(chalk.blue(padOrTrim("▸ " + t.name + "/", innerW)));
        } else {
          const slots = Math.max(0, remaining - 1);
          for (const t of targets.slice(0, slots)) push(chalk.blue(padOrTrim("▸ " + t.name + "/", innerW)));
          push(chalk.dim(padOrTrim(`... and ${targets.length - slots} more`, innerW)));
        }
      } else {
        const t = targets[0];
        const full = path.join(cwd, t.name);
        push(padOrTrim(chalk.gray("Dir: ") + chalk.blue(t.name + "/"), innerW));
        const remaining = maxLines - lines.length;
        if (remaining <= 0) return lines;
        try {
          const ch = fs.readdirSync(full, { withFileTypes: true });
          if (!ch.length) push(chalk.gray(padOrTrim("(empty directory)", innerW)));
          else if (ch.length <= remaining) {
            for (const c of ch) {
              const row = (c.isDirectory() ? "▸ " : "  ") + c.name + (c.isDirectory() ? "/" : "");
              push((c.isDirectory() ? chalk.blue : chalk.gray)(padOrTrim(row, innerW)));
            }
          } else {
            const slots = Math.max(0, remaining - 1);
            for (const c of ch.slice(0, slots)) {
              const row = (c.isDirectory() ? "▸ " : "  ") + c.name + (c.isDirectory() ? "/" : "");
              push((c.isDirectory() ? chalk.blue : chalk.gray)(padOrTrim(row, innerW)));
            }
            push(chalk.dim(padOrTrim(`... and ${ch.length - slots} more`, innerW)));
          }
        } catch { push(chalk.red(padOrTrim("cannot read directory", innerW))); }
      }
      return lines.slice(0, maxLines);
    }

    type ConfirmMode = "confirm" | "browse" | "preview";
    let mode: ConfirmMode = "confirm";
    let confirmSel = 1;

    type BrowseEntry = { name: string; isDir: boolean };
    const browseRootPath = allowBrowse ? path.join(cwd, single!.name) : "";
    const browseRootLabel = allowBrowse ? (single!.name + "/") : "";
    let browsePath = browseRootPath;
    let browseLabel = browseRootLabel;
    let browseEntries: BrowseEntry[] = [];
    let browseSel = 0;
    let browseScrollTop = 0;
    const browseStack: { browsePath: string; browseLabel: string; browseSel: number; browseScrollTop: number }[] = [];

    let previewPath = "";
    let previewLabel = "";
    let previewLines: string[] | null = null;
    let previewScrollTop = 0;
    let previewScrollLeft = 0;
    let deleteFehOpen = false;

    function popupFrame(popupW: number, popupH: number, startX: number, startY: number): void {
      const borderCol = chalk.gray;
      const bgSpace = " ".repeat(popupW - 2);
      for (let r = 0; r < popupH; r++) {
        if (r === 0) w(at(startY + r, startX) + borderCol("┏" + "━".repeat(popupW - 2) + "┓"));
        else if (r === popupH - 1) w(at(startY + r, startX) + borderCol("┗" + "━".repeat(popupW - 2) + "┛"));
        else w(at(startY + r, startX) + borderCol("┃") + bgSpace + borderCol("┃"));
      }
    }

    function drawDeletePopup(): void {
      render();
      const cols = C(); const rows = R();
      const popupW = Math.min(cols - 10, Math.max(50, 52));
      const innerW = popupW - 4;
      const maxBody = Math.min(12, Math.max(2, rows - 14));
      const bodyLines = buildDeleteBodyLines(innerW, maxBody);
      const popupH = bodyLines.length + 6;
      const startY = Math.floor((rows - popupH) / 2);
      const startX = Math.floor((cols - popupW) / 2);
      popupFrame(popupW, popupH, startX, startY);

      const header = " MOVE TO TRASH ";
      w(at(startY + 1, startX + Math.floor((popupW - header.length) / 2)) + chalk.bold.yellow(header));
      w(at(startY + 2, startX + 2) + chalk.dim("─".repeat(popupW - 4)));
      let bodyRow = startY + 3;
      for (const bl of bodyLines) { w(at(bodyRow, startX + 2) + bl); bodyRow++; }

      let choiceLine = "";
      choiceLine += confirmSel === 0 ? chalk.bgWhite.black.bold("  Yes  ") + " " : chalk.green("  Yes  ") + " ";
      choiceLine += confirmSel === 1 ? chalk.bgWhite.black.bold("  No  ") + " " : chalk.red("  No  ") + " ";
      if (allowBrowse && !singleIsVideo) choiceLine += confirmSel === 2 ? chalk.bgWhite.black.bold("  Browse  ") + " " : chalk.yellow("  Browse  ") + " ";
      w(at(startY + popupH - 2, startX + Math.floor((popupW - visibleLen(choiceLine)) / 2)) + choiceLine);
    }

    function drawBrowsePopup(): void {
      render();
      const cols = C(); const rows = R();
      const popupW = Math.min(cols - 10, Math.max(60, 64));
      const innerW = popupW - 4;
      const popupH = Math.min(rows - 6, 18);
      const startY = Math.floor((rows - popupH) / 2);
      const startX = Math.floor((cols - popupW) / 2);
      popupFrame(popupW, popupH, startX, startY);

      const header = " BROWSE DIR ";
      w(at(startY + 1, startX + Math.floor((popupW - header.length) / 2)) + chalk.bold.yellow(header));
      w(at(startY + 2, startX + 2) + chalk.dim("─".repeat(popupW - 4)));

      const listTop = startY + 3;
      const shown = Math.max(1, popupH - 6);
      if (browseSel < browseScrollTop) browseScrollTop = browseSel;
      if (browseSel >= browseScrollTop + shown) browseScrollTop = browseSel - shown + 1;
      if (browseScrollTop < 0) browseScrollTop = 0;

      let out = "";
      if (!browseEntries.length) {
        out += at(listTop, startX + 2) + chalk.gray(padOrTrim("(empty directory)", innerW));
        for (let i = 1; i < shown; i++) out += at(listTop + i, startX + 2) + " ".repeat(innerW);
      } else {
        for (let i = 0; i < shown; i++) {
          out += at(listTop + i, startX + 2) + clr();
          const e = browseEntries[browseScrollTop + i];
          if (!e) { out += " ".repeat(innerW); continue; }
          const active = (browseScrollTop + i) === browseSel;
          const raw = " " + (e.isDir ? "▸ " : "  ") + e.name + (e.isDir ? "/" : "");
          const padded = padOrTrim(raw, innerW);
          out += active ? chalk.bgWhite.black.bold(padded) : (e.isDir ? chalk.blue(padded) : chalk.white(padded));
        }
      }
      w(out);

      const footer = chalk.dim("Esc Back  Tab Up  Enter Open  ↑/↓ Navigate");
      const label = chalk.gray("Dir: ") + chalk.blue(browseLabel);
      const footerLine = padOrTrim(label, innerW - 2) + "  " + footer;
      w(at(startY + popupH - 2, startX + 2) + padOrTrim(footerLine, innerW));
    }

    function drawPreviewPopup(): void {
      render();
      const cols = C(); const rows = R();
      const popupW = Math.min(cols - 10, Math.max(70, 72));
      const innerW = popupW - 4;
      const popupH = Math.min(rows - 6, 18);
      const startY = Math.floor((rows - popupH) / 2);
      const startX = Math.floor((cols - popupW) / 2);
      popupFrame(popupW, popupH, startX, startY);

      const header = " PREVIEW FILE ";
      w(at(startY + 1, startX + Math.floor((popupW - header.length) / 2)) + chalk.bold.yellow(header));
      w(at(startY + 2, startX + 2) + chalk.dim("─".repeat(popupW - 4)));

      const listTop = startY + 3;
      const shown = Math.max(1, popupH - 6);
      const ext = path.extname(previewPath).slice(1).toLowerCase();
      const isImage = IMAGE_EXTS.has(ext);
      const isVideo = VIDEO_EXTS.has(ext);
      if (!previewLines && !isImage && !isVideo) {
        try {
          const raw = fs.readFileSync(previewPath, "utf8");
          previewLines = raw.length === 0 ? [] : raw.split("\n");
        } catch { previewLines = ["(binary file)"]; }
      }

      let out = "";
      if (isImage || isVideo) {
        const dims = isImage ? readImageDimensions(previewPath) : readVideoDimensions(previewPath);
        out += at(listTop, startX + 2) + chalk.gray(padOrTrim("File: " + path.basename(previewPath), innerW));
        out += at(listTop + 1, startX + 2) + chalk.gray(padOrTrim(`Dimensions: ${dims ? `${dims.width}x${dims.height}` : "unknown"}`, innerW));
        for (let i = 2; i < shown; i++) out += at(listTop + i, startX + 2) + " ".repeat(innerW);
      } else if (!(previewLines && previewLines.length)) {
        out += at(listTop, startX + 2) + chalk.gray(padOrTrim("(empty file)", innerW));
        for (let i = 1; i < shown; i++) out += at(listTop + i, startX + 2) + " ".repeat(innerW);
      } else {
        const lines = previewLines ?? [];
        const ext = path.extname(previewPath).slice(1).toLowerCase();
        const colorFn = previewLineColor(ext);
        const maxTop = Math.max(0, lines.length - shown);
        previewScrollTop = Math.min(Math.max(0, previewScrollTop), maxTop);
        previewScrollLeft = Math.max(0, previewScrollLeft);
        const lineNoW = Math.min(5, Math.max(3, String(lines.length).length + 1));
        const bodyW = Math.max(1, innerW - lineNoW);
        const maxLineLen = lines.reduce((m, s) => Math.max(m, s.length), 0);
        const maxLeft = Math.max(0, maxLineLen - Math.max(1, bodyW - 1));
        previewScrollLeft = Math.min(previewScrollLeft, maxLeft);
        for (let i = 0; i < shown; i++) {
          out += at(listTop + i, startX + 2) + clr();
          const idx = previewScrollTop + i;
          const line = lines[idx];
          if (line === undefined) { out += " ".repeat(innerW); continue; }
          const sliced = line.slice(previewScrollLeft);
          const leftMark = previewScrollLeft > 0 ? "…" : "";
          const withLeft = leftMark + sliced;
          const body = withLeft.length > bodyW ? withLeft.slice(0, Math.max(0, bodyW - 1)) + "…" : withLeft;
          const ln = chalk.dim(String(idx + 1).padStart(lineNoW - 1, " ") + " ");
          out += ln + (line.trim().length === 0 ? chalk.dim : colorFn)(padOrTrim(body, bodyW));
        }
      }
      w(out);

      const label = chalk.gray("File: ") + chalk.white(previewLabel);
      const vRange = (!isImage && !isVideo && previewLines && previewLines.length > shown) ? ` ${previewScrollTop + 1}-${Math.min(previewScrollTop + shown, previewLines.length)}/${previewLines.length}` : "";
      const hRange = (!isImage && !isVideo && previewScrollLeft > 0) ? `  col ${previewScrollLeft + 1}` : "";
      w(at(startY + popupH - 2, startX + 2) + padOrTrim(padOrTrim(label, innerW) + chalk.dim(vRange + hRange), innerW));
    }

    function cleanupListeners(): void {
      if (deleteFehOpen) { closeImagePreview(); deleteFehOpen = false; }
      process.stdout.removeListener("resize", onCR);
      process.stdout.on("resize", onResize);
    }

    function doTrash(): void {
      let errors = 0;
      for (const t of targets) {
        try { moveToTrash(path.join(cwd, t.name)); allEntries = allEntries.filter(e => e.name !== t.name); }
        catch { errors++; }
      }
      entries = searchQuery ? runSearch(searchQuery) : visibleEntries();
      selected.clear();
      if (errors) showStatus(`  ${errors} error(s)`, true);
      selIdx = Math.min(selIdx, Math.max(0, entries.length - 1));
      refreshPreview();
    }

    function resetBrowseState(): void {
      browsePath = browseRootPath;
      browseLabel = browseRootLabel;
      browseSel = 0;
      browseScrollTop = 0;
      browseStack.length = 0;
    }

    function loadBrowseEntries(): void {
      try {
        browseEntries = fs.readdirSync(browsePath, { withFileTypes: true })
          .map(d => ({ name: d.name, isDir: d.isDirectory() }))
          .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      } catch { browseEntries = []; }
    }

    process.stdout.removeListener("resize", onResize);
    const onCR = () => { if (mode === "browse") drawBrowsePopup(); else if (mode === "preview") drawPreviewPopup(); else drawDeletePopup(); };
    process.stdout.on("resize", onCR);
    stdin.removeListener("data", onKey);

    function onConfirmKey(k: string): void {
      if (mode === "browse") {
        if (k === "\u001b" || k === "\u0003") { mode = "confirm"; resetBrowseState(); drawDeletePopup(); return; }
        if (k === "\u001b[A" && browseSel > 0) { browseSel--; drawBrowsePopup(); return; }
        if (k === "\u001b[B" && browseSel < browseEntries.length - 1) { browseSel++; drawBrowsePopup(); return; }
        if (k === "\t") {
          if (browseStack.length > 0) {
            const prev = browseStack.pop()!;
            browsePath = prev.browsePath; browseLabel = prev.browseLabel; browseSel = prev.browseSel; browseScrollTop = prev.browseScrollTop;
            loadBrowseEntries(); drawBrowsePopup();
          }
          return;
        }
        if (k.startsWith("\u001b")) return;
        if (k === "\r" && browseEntries.length > 0) {
          const e = browseEntries[browseSel];
          const fp = path.join(browsePath, e.name);
          if (e.isDir) {
            browseStack.push({ browsePath, browseLabel, browseSel, browseScrollTop });
            browsePath = fp; browseLabel = browseLabel + e.name + "/";
            loadBrowseEntries(); browseSel = 0; browseScrollTop = 0; drawBrowsePopup(); return;
          }
          previewPath = fp; previewLabel = e.name; previewLines = null; previewScrollTop = 0; previewScrollLeft = 0;
          mode = "preview";
          const ext = path.extname(previewPath).slice(1).toLowerCase();
          if (IMAGE_EXTS.has(ext)) { openImageWithFeh(previewPath); deleteFehOpen = true; }
          drawPreviewPopup(); return;
        }
        return;
      }

      if (mode === "preview") {
        if (k === "\u001b" || k === "\u0003") {
          if (deleteFehOpen) {
            closeImagePreview();
            deleteFehOpen = false;
            stdin.removeListener("data", onConfirmKey);
            cleanupListeners();
            stdin.on("data", onKey);
            fullRedraw();
            return;
          }
          mode = "browse";
          drawBrowsePopup();
          return;
        }
        const ext = path.extname(previewPath).slice(1).toLowerCase();
        if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) return;
        const shown = Math.max(1, Math.min(R() - 6, 18) - 6);
        if (k === "\u001b[A") { previewScrollTop = Math.max(0, previewScrollTop - 1); drawPreviewPopup(); return; }
        if (k === "\u001b[B") { previewScrollTop = previewLines ? Math.min(Math.max(0, previewLines.length - shown), previewScrollTop + 1) : previewScrollTop + 1; drawPreviewPopup(); return; }
        if (k === "\u001b[D") { previewScrollLeft = Math.max(0, previewScrollLeft - 1); drawPreviewPopup(); return; }
        if (k === "\u001b[C") { previewScrollLeft = previewScrollLeft + 1; drawPreviewPopup(); return; }
        if (k === "\u001b[5~") { previewScrollTop = Math.max(0, previewScrollTop - shown); drawPreviewPopup(); return; }
        if (k === "\u001b[6~") { previewScrollTop = previewLines ? Math.min(Math.max(0, previewLines.length - shown), previewScrollTop + shown) : previewScrollTop + shown; drawPreviewPopup(); return; }
        return;
      }

      if (k === "\u0003" || k === "\u001b" || k === "n" || k === "N") {
        stdin.removeListener("data", onConfirmKey); cleanupListeners(); stdin.on("data", onKey); fullRedraw(); return;
      }
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirmKey); cleanupListeners();
        doTrash();
        if (!entries.length && !allEntries.length) { process.chdir(cwd); return exit(); }
        stdin.on("data", onKey); fullRedraw(); return;
      }
      if ((k === "o" || k === "O") && allowBrowse && !singleIsVideo) { confirmSel = 2; drawDeletePopup(); return; }
      if (k === "\r") {
        if (confirmSel === 0) {
          stdin.removeListener("data", onConfirmKey); cleanupListeners();
          doTrash();
          if (!entries.length && !allEntries.length) { process.chdir(cwd); return exit(); }
          stdin.on("data", onKey); fullRedraw(); return;
        }
        if (confirmSel === 2 && allowBrowse && !singleIsVideo) {
          resetBrowseState(); loadBrowseEntries(); browseSel = 0; browseScrollTop = 0; mode = "browse"; drawBrowsePopup(); return;
        }
        stdin.removeListener("data", onConfirmKey); cleanupListeners(); stdin.on("data", onKey); fullRedraw(); return;
      }
      const maxSel = (allowBrowse && !singleIsVideo) ? 2 : 1;
      if (k === "\u001b[C") confirmSel = Math.min(maxSel, confirmSel + 1);
      else if (k === "\u001b[D") confirmSel = Math.max(0, confirmSel - 1);
      drawDeletePopup();
    }

    stdin.on("data", onConfirmKey);
    drawDeletePopup();
  }

  function doSort(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showSortPicker("dir", currentSort, R() - 2,
      (result) => {
        currentSort = result; process.stdout.on("resize", onResize);
        const prev = entries[selIdx]?.name; allEntries = loadDirs(cwd);
        entries = searchQuery ? runSearch(searchQuery) : visibleEntries(); selIdx = 0;
        if (prev) { const idx = entries.findIndex(e => e.name === prev); if (idx >= 0) selIdx = idx; }
        adjustScroll(); refreshPreview(); fullRedraw(); stdin.on("data", onKey);
      },
      () => { process.stdout.on("resize", onResize); fullRedraw(); stdin.on("data", onKey); }
    );
  }

  function openLog(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showFileOpsLog(() => { enterAlt(); process.stdout.on("resize", onResize); clearScreen(); fullRedraw(); stdin.on("data", onKey); });
  }

  function doBookmarkToggle(): void {
    if (!entries.length) return;
    const entry = entries[selIdx];
    const fullPath = path.join(cwd, entry.name);
    const result = toggleBookmark(fullPath);
    showStatus(result === "added" ? `  Bookmarked: ${entry.name}/` : `  Removed bookmark: ${entry.name}/`);
    render();
  }

  function openBookmarks(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showBookmarkPicker(
      cwd,
      (dir) => {
        try { cwd = dir; process.chdir(cwd); } catch { }
        searchQuery = ""; searchActive = false;
        reloadEntries(cwd); enterAlt(); process.stdout.on("resize", onResize); clearScreen(); fullRedraw(); stdin.on("data", onKey);
      },
      () => { enterAlt(); process.stdout.on("resize", onResize); clearScreen(); fullRedraw(); stdin.on("data", onKey); }
    );
  }

  function onResize(): void { adjustScroll(); fullRedraw(); }

  function onKey(k: string): void {
    if (searchActive) { handleSearchKey(k); return; }

    if (browseMode) {
      if (k === "\u0003") { exitBrowse(); process.chdir(cwd); exit(); return; }
      if (k === "\u001b" || k === "q") {
        if (fehOpen) {
          closeImagePreview();
          fehOpen = false;
          exitBrowse();
          return;
        }
        exitBrowse();
        return;
      }
      if (k === "\u001b[A") { browseNavigate(-1); return; }
      if (k === "\u001b[B") { browseNavigate(1); return; }
      if (k === "\u001b[5~") { browseNavigate(-5); return; }
      if (k === "\u001b[6~") { browseNavigate(5); return; }
      if (k === "\t") { browseParent(); return; }
      if (k === "\r") { browseEnter(); return; }
      return;
    }
    if (moveModePending) {
      if (k === "\u0003") { moveModePending = null; fullRedraw(); process.chdir(cwd); exit(); return; }
      if (k === "\u001b") { moveModePending = null; fullRedraw(); return; }
      if (k === "y" || k === "Y" || k === "\r") {
        if (k === "\r" && entries.length) { goInto(entries[selIdx].name); return; }
        doMoveConfirm(); return;
      }
      if (k === "\t") { goUp(); return; }
      if (k === ".") { toggleHidden(); return; }
      if (k === "\u001b[5~") { scrollPreview(pvState, -5, vis()); renderPreview(); drawBottom(); return; }
      if (k === "\u001b[6~") { scrollPreview(pvState, 5, vis()); renderPreview(); drawBottom(); return; }
      if (navigate(k)) render();
      return;
    }
    if (k === "\u0003") { process.chdir(cwd); return exit(); }
    if (k === "\u001b") {
      if (searchQuery) { searchQuery = ""; searchActive = false; reloadEntries(); fullRedraw(); return; }
      if (getClipboard()) { clearClipboard(); render(); return; }
      if (selected.size > 0) { selected.clear(); render(); return; }
      process.chdir(cwd); exit(); return;
    }
    if (k === "h") { openLog(); return; }
    if (k === "/") { openSearch(); return; }
    if (k === "o") {
      if (pvState.content?.kind === "dir") { enterBrowse(); }
      return;
    }
    if (k === "s") { doSort(); return; }
    if (k === "n") { doMkdir(); return; }
    if (k === "b") { doBookmarkToggle(); return; }
    if (k === "\x02") { openBookmarks(); return; }
    if (k === "p") { togglePreviewPref(); fullRedraw(); return; }
    if (k === "\r") { if (entries.length) goInto(entries[selIdx].name); return; }
    if (k === "\t") { goUp(); return; }
    if (k === ".") { toggleHidden(); return; }
    if (k === " ") { toggleSelect(); render(); return; }
    if (k === "a") { selectAll(); render(); return; }
    if (k === "c") { doCopy(); return; }
    if (k === "x") { doCut(); return; }
    if (k === "v") { doPaste(); return; }
    if (k === "r") { doRename(); return; }
    if (k === "m") { doMoveInit(); return; }
    if (k === "d" || k === "D") { if (entries.length) showDeleteConfirm(); return; }
    if (k === "\u001b[5~") { scrollPreview(pvState, -5, vis()); renderPreview(); drawBottom(); return; }
    if (k === "\u001b[6~") { scrollPreview(pvState, 5, vis()); renderPreview(); drawBottom(); return; }
    if (navigate(k)) render();
  }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  refreshPreview(); enterAlt(); fullRedraw();
}