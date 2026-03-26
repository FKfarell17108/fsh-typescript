import fs from "fs";
import path from "path";
import chalk from "chalk";
import { moveToTrash } from "./trash";
import { w, at, clr, C, R, drawNavbar, NavItem, NavRows, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";
import { getClipboard, setClipboard, clearClipboard, execCopy, execMove, execRename, uniqueDest, loadLog } from "./fileOps";
import { showFileOpsLog } from "./fileOpsLog";
import { showInlineInput } from "./interactiveLs";
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
  SPLIT_THRESHOLD, OVERLAY_LINES,
} from "./preview";
import { getGitDirStatus } from "./git";

type ActionKind = "copy" | "cut" | "move" | "rename" | "paste" | null;

function actionColor(kind: ActionKind): (s: string) => string {
  switch (kind) {
    case "copy":   return chalk.hex("#56D4D4");
    case "cut":    return chalk.hex("#FFD580");
    case "move":   return chalk.hex("#FFA878");
    case "rename": return chalk.hex("#D4A9F5");
    case "paste":  return chalk.hex("#AEDD87");
    default:       return chalk.white;
  }
}

function actionLabel(kind: ActionKind, name: string): string {
  if (!kind) return "";
  return actionColor(kind)(`${kind.charAt(0).toUpperCase() + kind.slice(1)}: `) + chalk.white(name);
}

function cellActionStyle(kind: ActionKind, cell: string, hidden: boolean): string {
  switch (kind) {
    case "copy":  return chalk.hex("#56D4D4").underline(cell);
    case "cut":   return chalk.hex("#FFD580").underline(cell);
    case "move":  return chalk.hex("#FFA878").bold(cell);
    default:      return hidden ? chalk.cyan(cell) : chalk.blue.bold(cell);
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

export function interactiveDir(onExit: () => void): void {
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
  let searchQuery  = "";

  const visibleEntries = () => {
    const base = showHidden ? allEntries : allEntries.filter(e => !e.hidden);
    return sortDirEntriesWithStat(base, currentSort, cwd);
  };

  let entries = visibleEntries();

  if (!process.stdin.isTTY) { console.log(entries.map(e => e.name + "/").join("  ")); return onExit(); }
  if (allEntries.length === 0) { console.log(chalk.gray("(no subdirectories)")); return onExit(); }
  if (entries.length === 0 && allEntries.length > 0) { showHidden = true; entries = visibleEntries(); }
  if (entries.length === 0) { console.log(chalk.gray("(no subdirectories)")); return onExit(); }

  const stdin = process.stdin;
  let selIdx = 0; let scrollTop = 0;
  let selected = new Set<string>();
  let statusMsg = ""; let statusTimer: ReturnType<typeof setTimeout> | null = null;

  let previewPref: PreviewPref = "auto";
  const pvState: PreviewState  = makePreviewState();

  let browseMode  = false;
  let browseIdx   = 0;
  let browseStack: { path: string; idx: number; scrollTop: number }[] = [];

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
        try { isDir = e.isDirectory() || (e.isSymbolicLink() && fs.statSync(full).isDirectory()); } catch {}
        if (!isDir) continue;
        const relPath = path.relative(cwd, full);
        if (relPath.startsWith("..")) continue;
        results.push({ name: e.name, hidden: e.name.startsWith("."), relPath });
        if (!SKIP.has(e.name)) results.push(...scanRecursive(full, depth + 1));
      }
    } catch {}
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
      : (C() >= SPLIT_THRESHOLD ? "split"   : "auto");
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
    const cb   = getClipboard() as any;
    const mode = getPreviewMode(previewPref);
    if (browseMode) {
      return [[
        { key: "Nav", label: "Navigate"    },
        { key: "Ent", label: "Open/Enter"  },
        { key: "Tab", label: "Parent"      },
        { key: "Esc", label: "Back to List"},
      ]];
    }
    if (moveModePending) {
      return [[
        { key: "Nav", label: "Navigate"                                 },
        { key: "Ent", label: "Enter Dir"                                },
        { key: "Tab", label: "Parent"                                   },
        { key: ".",   label: showHidden ? "Hide Hidden" : "Show Hidden" },
      ]];
    }
    const oLabel = pvState.content?.kind === "dir" ? "Browse" : "Preview";
    return [
      [
        { key: "Nav", label: "Navigate"  },
        { key: "Spc", label: "Select"    },
        { key: "A",   label: "All"       },
        { key: "Ent", label: "Enter"     },
        { key: "Tab", label: "Parent"    },
        { key: "O",   label: oLabel      },
        { key: "P",   label: mode === "split" ? "Overlay" : "Split" },
        { key: "Esc", label: cb ? "Cancel Clip" : selected.size > 0 ? "Deselect" : "Quit" },
      ],
      [
        { key: "C", label: "Copy"   },
        { key: "X", label: "Cut"    },
        { key: "V", label: "Paste"  },
        { key: "R", label: "Rename" },
        { key: "M", label: "Move"   },
        { key: "D", label: "Delete" },
        { key: "H", label: "History"},
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
    browseMode = false; browseIdx = 0; browseStack = []; pvState.scrollTop = 0;
    clearScreen(); render();
  }

  function syncBrowseScroll(): void {
    const metaLines   = getMetaLineCount(pvState.content!);
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
  }

  function browseEnter(): void {
    const be = getDirEntries(pvState.content!); if (!be.length) return;
    const entry = be[browseIdx];
    const resolvedFull = path.join(pvState.path, entry.name);
    if (entry.isDir) {
      browseStack.push({ path: pvState.path, idx: browseIdx, scrollTop: pvState.scrollTop });
      forceUpdatePreview(pvState, resolvedFull);
      browseIdx = 0; syncBrowseScroll(); renderPreview(); drawBottom();
    }
  }

  function browseParent(): void {
    if (browseStack.length <= 1) { exitBrowse(); return; }
    const prev = browseStack.pop()!;
    const parentFrame = browseStack[browseStack.length - 1];
    forceUpdatePreview(pvState, parentFrame.path);
    browseIdx = prev.idx; pvState.scrollTop = prev.scrollTop;
    syncBrowseScroll(); renderPreview(); drawBottom();
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
    if (row < scrollTop)      scrollTop = row;
    if (row >= scrollTop + v) scrollTop = row - v + 1;
  }

  function navigate(key: string): boolean {
    const p = pr(); const total = entries.length; if (!total) return false;
    const curRow = Math.floor(selIdx / p); const curCol = selIdx % p; let next = selIdx;
    if      (key === "\u001b[A") { if (curRow === 0) return false; next = (curRow - 1) * p + curCol; if (next >= total) next = total - 1; }
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
        const full = path.join(cwd, entries[selIdx].name);
        return full;
      }
      return cwd;
    })();
    const gs = getGitDirStatus(targetDir);
    if (gs.kind === "none") return chalk.red("no git");
    return chalk.hex("#AEDD87")(`git: ${gs.repoName}`) + chalk.dim(` (${gs.branch})`);
  }

  function buildLeft(): string {
    const home = process.env.HOME ?? ""; const rel = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
    const hidC = allEntries.filter(e => e.hidden).length;
    let s = rel; s += `  ${entries.length}d`;
    if (!showHidden && hidC) s += chalk.dim(`  ${hidC} hidden`);
    if (selected.size) s += chalk.magenta(`  ${selected.size} sel`);
    if (searchQuery)   s += chalk.cyan(`  /${searchQuery}`);
    const al = getActiveActionLabel();
    if (al) s += "    " + al;
    s += "    " + buildGitStatus();
    return s;
  }

  function buildRight(): string {
    const mode    = getPreviewMode(previewPref);
    const modeStr = browseMode ? chalk.cyan(" [browse]") : chalk.dim(mode === "split" ? " [split]" : " [overlay]");
    const pgHint  = pvState.content ? chalk.dim("  [PgUp/PgDn] Scroll") : "";
    if (tr() <= vis()) return modeStr + pgHint;
    const more = tr() - (scrollTop + vis());
    return (more > 0 ? `↓ ${more} more` : "end") + modeStr + pgHint;
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
    const cols  = C();
    const line  = chalk.hex("#FFA878").bold("  Move ") + chalk.white(moveModePending.label) +
                  "  " + chalk.bgGreen.black.bold(" Y ") + chalk.white(" Move Here") +
                  "  " + chalk.bgRed.white.bold(" Esc ") + chalk.white(" Cancel");
    const vl    = visibleLen(line);
    w(at(R() - 1, 1) + "\x1b[2K\x1b[0m");
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + line + (vl < cols ? " ".repeat(cols - vl) : ""));
  }

  function drawBottom(): void {
    if (statusMsg) { w(at(R(), 1) + "\x1b[2K\x1b[0m" + statusMsg); return; }
    if (moveModePending) { drawMoveConfirmBar(); return; }
    drawMiniBar();
    const cols = C();
    const ls   = "  " + buildLeft();
    const rs   = buildRight() ? buildRight() + "  " : "";
    const gap  = Math.max(0, cols - visibleLen(ls) - visibleLen(rs));
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + chalk.dim(ls) + " ".repeat(gap) + chalk.dim(rs));
  }

  function showStatus(msg: string, isErr = false): void {
    if (statusTimer) clearTimeout(statusTimer);
    statusMsg = isErr ? chalk.red(msg) : chalk.green(msg);
    w(at(R(), 1) + "\x1b[2K\x1b[0m" + statusMsg);
    statusTimer = setTimeout(() => { statusMsg = ""; drawBottom(); statusTimer = null; }, 2000);
  }

  function drawContent(): void {
    const lw    = effectiveListW();
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
        const isCursor   = i === selIdx; const isSel = selected.has(name);
        const itemAction = isItemActive(name);
        const dispName   = name + "/";
        const prefix     = isSel ? "✓ " : "  ";
        const maxNameW   = Math.min(cWidth, lw - visCount) - prefix.length;
        if (maxNameW <= 0) break;
        const truncDisp  = dispName.length > maxNameW ? dispName.slice(0, maxNameW - 1) + "…" : dispName;
        const cell       = (prefix + truncDisp).padEnd(cWidth, " ").slice(0, cWidth);
        if (visCount + cWidth > lw) break;
        if      (isCursor && isSel) line += chalk.bgMagenta.white.bold(cell);
        else if (isCursor)          line += chalk.bgWhite.black.bold(cell);
        else if (isSel)             line += chalk.magenta.bold(cell);
        else if (itemAction)        line += cellActionStyle(itemAction, cell, hidden);
        else if (isBookmarked(path.join(cwd, name))) line += hidden ? chalk.hex("#FFD580")(cell) : chalk.hex("#FFD580").bold(cell);
        else if (hidden)            line += chalk.cyan(cell);
        else                        line += chalk.blue.bold(cell);
        visCount += cWidth;
      }
      out += at(start + row, 1) + "\x1b[2K" + line + " ".repeat(Math.max(0, lw - visCount));
    }
    w(out);
  }

  function renderPreview(): void {
    if (!pvState.content) return;
    const bIdx = browseMode ? browseIdx : undefined;
    if (isSplit()) drawSplitPreview(pvState, NR(), effectiveListW(), bIdx);
    else           drawOverlayPreview(pvState, NR(), bIdx);
  }

  function render(): void { drawNavbar(NAV()); drawContent(); renderPreview(); drawBottom(); }
  function fullRedraw(): void { clearScreen(); adjustScroll(); render(); }
  function cleanup(): void { process.stdout.removeListener("resize", onResize); stdin.removeAllListeners("data"); exitAlt(); }
  function exit(): void { process.chdir(cwd); cleanup(); setTimeout(onExit, 50); }

  function buildMultiClip(kind: "copy" | "cut") {
    const targets = getTargets();
    const items = targets.map(t => ({ srcPath: path.join(cwd, t.name), srcName: t.name, isDir: true }));
    return { kind, srcPath: items[0].srcPath, srcName: items.length === 1 ? items[0].srcName : `${items.length} dirs`, isDir: true, items };
  }

  function doCopy(): void { const t = getTargets(); if (!t.length) return; setClipboard(buildMultiClip("copy") as any); selected.clear(); render(); }
  function doCut():  void { const t = getTargets(); if (!t.length) return; setClipboard(buildMultiClip("cut")  as any); selected.clear(); render(); }

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
    const targets = getTargets(); if (!targets.length) return; const multi = targets.length > 1;
    const confirmNav: NavItem[] = [{ key: "Y", label: "Move to Trash", color: "yellow" }, { key: "N/Esc", label: "Cancel", color: "green" }];
    function drawConfirm(): void {
      const start = 3; const avail = R() - 3; const cols = C();
      drawNavbar([confirmNav]); let out = ""; let ln = 0;
      function line(s: string) { if (ln >= avail) return; out += at(start + ln, 1) + clr() + s; ln++; }
      if (multi) {
        line(chalk.bold(`  Move ${targets.length} dirs to trash`)); line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        for (const t of targets.slice(0, avail - 3)) line(chalk.blue("  ▸ ") + chalk.white(t.name + "/"));
        if (targets.length > avail - 3) line(chalk.gray(`  ... and ${targets.length - (avail - 3)} more`));
      } else {
        const full = path.join(cwd, targets[0].name);
        line(chalk.bold("  dir  " + targets[0].name + "/")); line(chalk.dim("─".repeat(Math.min(cols - 2, 60))));
        try {
          const ch = fs.readdirSync(full, { withFileTypes: true });
          if (!ch.length) { line(chalk.gray("  (empty directory)")); }
          else { for (const c of ch.slice(0, avail - 3)) line((c.isDirectory() ? chalk.blue("  ▸ ") : chalk.gray("    ")) + chalk.white(c.name + (c.isDirectory() ? "/" : ""))); if (ch.length > avail - 3) line(chalk.gray(`  ... and ${ch.length - (avail - 3)} more`)); }
        } catch { line(chalk.red("  cannot read directory")); }
      }
      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();
      w(out); drawBottomBar("Move to Trash?", "");
    }
    process.stdout.removeListener("resize", onResize);
    const onCR = () => { clearScreen(); drawConfirm(); };
    process.stdout.on("resize", onCR); stdin.removeListener("data", onKey);
    function onConfirm(k: string): void {
      if (k === "y" || k === "Y") {
        stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR); process.stdout.on("resize", onResize);
        let errors = 0;
        for (const t of targets) { try { moveToTrash(path.join(cwd, t.name)); allEntries = allEntries.filter(e => e.name !== t.name); } catch { errors++; } }
        entries = searchQuery ? runSearch(searchQuery) : visibleEntries(); selected.clear();
        if (!entries.length && !allEntries.length) { process.chdir(cwd); return exit(); }
        if (errors) showStatus(`  ${errors} error(s)`, true);
        selIdx = Math.min(selIdx, Math.max(0, entries.length - 1)); refreshPreview(); stdin.on("data", onKey); fullRedraw(); return;
      }
      if (k === "n" || k === "N" || k === "\u001b" || k === "\u0003") { stdin.removeListener("data", onConfirm); process.stdout.removeListener("resize", onCR); process.stdout.on("resize", onResize); stdin.on("data", onKey); fullRedraw(); }
    }
    stdin.on("data", onConfirm); clearScreen(); drawConfirm();
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
    const entry    = entries[selIdx];
    const fullPath = path.join(cwd, entry.name);
    const result   = toggleBookmark(fullPath);
    showStatus(result === "added" ? `  Bookmarked: ${entry.name}/` : `  Removed bookmark: ${entry.name}/`);
    render();
  }

  function openBookmarks(): void {
    process.stdout.removeListener("resize", onResize); stdin.removeListener("data", onKey);
    showBookmarkPicker(
      cwd,
      (dir) => {
        try { cwd = dir; process.chdir(cwd); } catch {}
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
      if (k === "\u001b" || k === "q") { exitBrowse(); return; }
      if (k === "\u001b[A") { browseNavigate(-1); return; }
      if (k === "\u001b[B") { browseNavigate(1);  return; }
      if (k === "\u001b[5~") { browseNavigate(-5); return; }
      if (k === "\u001b[6~") { browseNavigate(5);  return; }
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
      if (k === "\u001b[6~") { scrollPreview(pvState,  5, vis()); renderPreview(); drawBottom(); return; }
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
    if (k === "\u001b[6~") { scrollPreview(pvState,  5, vis()); renderPreview(); drawBottom(); return; }
    if (navigate(k)) render();
  }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  refreshPreview(); enterAlt(); fullRedraw();
}