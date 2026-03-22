import fs from "fs";
import path from "path";
import chalk from "chalk";
import { w, at, C, R, visibleLen } from "./tui";

export const SPLIT_THRESHOLD = 110;
export const PREVIEW_RATIO   = 0.4;
export const OVERLAY_LINES   = 12;

export type PreviewMode = "split" | "overlay";
export type PreviewPref = "auto" | "split" | "overlay";

export function getPreviewMode(pref: PreviewPref): PreviewMode {
  if (pref === "split")   return "split";
  if (pref === "overlay") return "overlay";
  return C() >= SPLIT_THRESHOLD ? "split" : "overlay";
}

export function previewCols(): number { return Math.floor(C() * PREVIEW_RATIO); }
export function listCols(): number    { return C() - previewCols() - 1; }

export type DirEntry = { name: string; isDir: boolean; };

export type PreviewContent =
  | { kind: "text";   lines: string[]; totalLines: number; meta: FileMeta }
  | { kind: "binary"; meta: FileMeta }
  | { kind: "dir";    entries: DirEntry[]; total: number; meta: DirMeta }
  | { kind: "empty" };

export type FileMeta = { size: string; modified: string; perms: string; ext: string; };
export type DirMeta  = { totalItems: number; dirs: number; files: number; sizeStr: string; };

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtPerms(mode: number): string {
  const s = ["---","--x","-w-","-wx","r--","r-x","rw-","rwx"];
  return s[(mode>>6)&7] + s[(mode>>3)&7] + s[mode&7];
}

function fmtDate(d: Date): string {
  return d.toLocaleString([], { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

function isBinary(buf: Buffer): boolean {
  const check = buf.slice(0, 512);
  for (let i = 0; i < check.length; i++) {
    const b = check[i];
    if (b === 0) return true;
    if (b < 8 || (b > 13 && b < 32 && b !== 27)) return true;
  }
  return false;
}

function dirSize(dirPath: string, depth = 0): number {
  if (depth > 3) return 0;
  let total = 0;
  try {
    for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, e.name);
      try { if (e.isDirectory()) total += dirSize(full, depth+1); else total += fs.statSync(full).size; } catch {}
    }
  } catch {}
  return total;
}

export function buildPreview(fullPath: string): PreviewContent {
  let stat: fs.Stats;
  try { stat = fs.statSync(fullPath); } catch { return { kind: "empty" }; }

  if (stat.isDirectory()) {
    let entries: DirEntry[] = []; let dirs = 0; let files = 0;
    try {
      const raw = fs.readdirSync(fullPath, { withFileTypes: true });
      dirs  = raw.filter(e => e.isDirectory()).length;
      files = raw.filter(e => !e.isDirectory()).length;
      entries = raw
        .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    } catch {}
    return { kind:"dir", entries, total: dirs+files, meta:{ totalItems:dirs+files, dirs, files, sizeStr:fmtSize(dirSize(fullPath)) } };
  }

  const meta: FileMeta = {
    size:     fmtSize(stat.size),
    modified: fmtDate(new Date(stat.mtimeMs)),
    perms:    fmtPerms(stat.mode & 0o777),
    ext:      path.extname(fullPath).slice(1).toLowerCase(),
  };

  if (stat.size === 0)             return { kind:"text", lines:[""], totalLines:0, meta };
  if (stat.size > 2*1024*1024)     return { kind:"binary", meta };
  let buf: Buffer;
  try { buf = fs.readFileSync(fullPath); } catch { return { kind:"binary", meta }; }
  if (isBinary(buf))               return { kind:"binary", meta };
  const lines = buf.toString("utf8").split("\n");
  return { kind:"text", lines, totalLines: lines.length, meta };
}

const TEXT_COLORS: Record<string, (s:string)=>string> = {
  ts:chalk.hex("#6EC6BF"), js:chalk.hex("#FFD580"), tsx:chalk.hex("#6EC6BF"), jsx:chalk.hex("#FFD580"),
  json:chalk.hex("#AEDD87"), md:chalk.hex("#D4A9F5"), py:chalk.hex("#FFD580"),
  sh:chalk.hex("#AEDD87"), bash:chalk.hex("#AEDD87"), css:chalk.hex("#70D4FF"),
  html:chalk.hex("#FFA878"), xml:chalk.hex("#FFA878"), yml:chalk.hex("#FF9E64"),
  yaml:chalk.hex("#FF9E64"), toml:chalk.hex("#FF9E64"), env:chalk.hex("#FF9E64"),
  rs:chalk.hex("#FFA878"), go:chalk.hex("#70D4FF"), java:chalk.hex("#F5C542"),
  c:chalk.hex("#B0B8D8"), cpp:chalk.hex("#B0B8D8"), h:chalk.hex("#B0B8D8"),
  rb:chalk.hex("#FF7B8A"), php:chalk.hex("#D4A9F5"), sql:chalk.hex("#5BC8F5"),
  log:chalk.hex("#888FA8"), txt:chalk.white,
};
function lineColor(ext: string): (s:string)=>string { return TEXT_COLORS[ext] ?? chalk.white; }

function padLine(l: string, width: number): string {
  const vl = visibleLen(l);
  return vl < width ? l + " ".repeat(width - vl) : l;
}

function renderMeta(meta: FileMeta, width: number): string[] {
  const d = chalk.dim; const v = chalk.white;
  return [
    d("─".repeat(width)),
    d("  size      ") + v(meta.size),
    d("  modified  ") + v(meta.modified),
    d("  perms     ") + v(meta.perms),
    ...(meta.ext ? [d("  type      ") + v(meta.ext)] : []),
    d("─".repeat(width)),
  ].map(l => padLine(l, width));
}

function renderDirMeta(meta: DirMeta, width: number): string[] {
  const d = chalk.dim; const v = chalk.white;
  return [
    d("─".repeat(width)),
    d("  items     ") + v(String(meta.totalItems)),
    d("  dirs      ") + v(String(meta.dirs)),
    d("  files     ") + v(String(meta.files)),
    d("  size      ") + v(meta.sizeStr),
    d("─".repeat(width)),
  ].map(l => padLine(l, width));
}

export type PreviewState = {
  scrollTop: number;
  path:      string;
  content:   PreviewContent | null;
};

export function makePreviewState(): PreviewState {
  return { scrollTop: 0, path: "", content: null };
}

export function updatePreview(state: PreviewState, fullPath: string): void {
  if (state.path === fullPath) return;
  state.path    = fullPath;
  state.content = buildPreview(fullPath);
  state.scrollTop = 0;
}

export function forceUpdatePreview(state: PreviewState, fullPath: string): void {
  state.path    = fullPath;
  state.content = buildPreview(fullPath);
  state.scrollTop = 0;
}

export function scrollPreview(state: PreviewState, delta: number, visLines: number): void {
  if (!state.content) return;
  const total = totalPreviewLines(state.content);
  state.scrollTop = Math.max(0, Math.min(state.scrollTop + delta, Math.max(0, total - visLines)));
}

function totalPreviewLines(content: PreviewContent): number {
  if (content.kind === "text")   return content.lines.length + 7;
  if (content.kind === "binary") return 8;
  if (content.kind === "dir")    return content.entries.length + 8;
  return 1;
}

export function renderPreviewLines(state: PreviewState, width: number): string[] {
  if (!state.content) return [chalk.dim("  no preview")];
  return renderContent(state.content, width);
}

function renderContent(content: PreviewContent, width: number): string[] {
  if (content.kind === "empty")  return [padLine(chalk.dim("  (nothing here)"), width)];
  if (content.kind === "binary") return [padLine(chalk.dim("  binary file"), width), ...renderMeta(content.meta, width)];

  if (content.kind === "dir") {
    const lines: string[] = [];
    if (content.total === 0) {
      lines.push(padLine(chalk.dim("  (empty directory)"), width));
      return lines;
    }
    lines.push(padLine(chalk.blue.bold("  " + String(content.total) + " items"), width));
    lines.push(...renderDirMeta(content.meta, width));
    for (const e of content.entries) {
      const icon   = e.isDir ? "▸ " : "  ";
      const hidden = e.name.startsWith(".");
      const nameC  = e.isDir ? (hidden ? chalk.cyan : chalk.blue) : (hidden ? chalk.dim : chalk.white);
      lines.push(padLine("  " + (e.isDir ? chalk.blue(icon) : icon) + nameC(e.name), width));
    }
    return lines;
  }

  const { lines: rawLines, meta } = content;
  const colorFn = lineColor(meta.ext);
  const out: string[] = [];
  out.push(...renderMeta(meta, width));
  if (rawLines.length === 0 || (rawLines.length === 1 && rawLines[0] === "")) {
    out.push(padLine(chalk.dim("  (empty file)"), width));
    return out;
  }
  for (let i = 0; i < rawLines.length; i++) {
    const num  = chalk.dim(String(i+1).padStart(4) + " ");
    const maxW = Math.max(0, width - 6);
    const text = rawLines[i].length > maxW ? rawLines[i].slice(0, maxW-1) + "…" : rawLines[i];
    out.push(padLine(num + colorFn(text), width));
  }
  return out;
}

export function renderBrowseLines(
  content:  PreviewContent,
  browseIdx: number,
  width:    number,
  scrollTop: number,
  visH:     number,
): string[] {
  if (content.kind !== "dir") return renderContent(content, width);
  const metaLines = renderDirMeta(content.meta, width);
  const HEADER = 2;
  const allLines: string[] = [];
  allLines.push(padLine(chalk.blue.bold("  " + String(content.total) + " items"), width));
  allLines.push(...metaLines);
  for (let i = 0; i < content.entries.length; i++) {
    const e      = content.entries[i];
    const icon   = e.isDir ? chalk.blue("▸ ") : "  ";
    const hidden = e.name.startsWith(".");
    const nameC  = e.isDir ? (hidden ? chalk.cyan : chalk.blue) : (hidden ? chalk.dim : chalk.white);
    const isCur  = i === browseIdx - HEADER - metaLines.length + HEADER;
    const raw    = "  " + icon + nameC(e.name);
    if (isCur) allLines.push(chalk.bgWhite.black.bold(padLine("  " + icon + e.name, width)));
    else       allLines.push(padLine(raw, width));
  }
  return allLines;
}

export function drawSplitPreview(
  state:     PreviewState,
  navRows:   number,
  listW:     number,
  browseIdx?: number,
): void {
  const pvW    = C() - listW - 1;
  const startR = navRows + 2;
  const endR   = R() - 1;
  const visH   = Math.max(1, endR - startR + 1);
  const divCol = listW + 1;

  const lines = browseIdx !== undefined && state.content?.kind === "dir"
    ? buildBrowseLines(state.content, browseIdx, pvW)
    : renderPreviewLines(state, pvW);

  let out = "";
  for (let i = 0; i < visH; i++) {
    const line   = lines[state.scrollTop + i] ?? "";
    const vl     = visibleLen(line);
    const padded = vl < pvW ? line + " ".repeat(pvW - vl) : line;
    out += at(startR + i, divCol) + chalk.dim("│") + padded;
  }
  w(out);
}

export function drawOverlayPreview(
  state:     PreviewState,
  navRows:   number,
  browseIdx?: number,
): void {
  const cols   = C();
  const startR = R() - OVERLAY_LINES - 1;
  const visH   = OVERLAY_LINES;

  const lines = browseIdx !== undefined && state.content?.kind === "dir"
    ? buildBrowseLines(state.content, browseIdx, cols - 2)
    : renderPreviewLines(state, cols - 2);

  let out = "";
  out += at(startR, 1) + chalk.dim("─".repeat(cols));
  for (let i = 0; i < visH; i++) {
    const line = lines[state.scrollTop + i] ?? "";
    const vl   = visibleLen(line);
    const pad  = Math.max(0, cols - 2 - vl);
    out += at(startR + 1 + i, 1) + " " + line + " ".repeat(pad) + " ";
  }
  w(out);
}

function buildBrowseLines(content: PreviewContent, browseIdx: number, width: number): string[] {
  if (content.kind !== "dir") return renderContent(content, width);
  const lines: string[] = [];
  if (content.total === 0) {
    lines.push(padLine(chalk.dim("  (empty directory)"), width));
    return lines;
  }
  lines.push(padLine(chalk.blue.bold("  " + String(content.total) + " items"), width));
  lines.push(...renderDirMeta(content.meta, width));
  for (let i = 0; i < content.entries.length; i++) {
    const e      = content.entries[i];
    const icon   = e.isDir ? "▸ " : "  ";
    const hidden = e.name.startsWith(".");
    const nameC  = e.isDir ? (hidden ? chalk.cyan : chalk.blue) : (hidden ? chalk.dim : chalk.white);
    const isCur  = i === browseIdx;
    if (isCur) {
      const raw = "  " + icon + e.name;
      lines.push(chalk.bgWhite.black.bold(padLine(raw, width)));
    } else {
      const coloredIcon = e.isDir ? chalk.blue(icon) : icon;
      lines.push(padLine("  " + coloredIcon + nameC(e.name), width));
    }
  }
  return lines;
}

export function getDirEntries(content: PreviewContent): DirEntry[] {
  if (content.kind === "dir") return content.entries;
  return [];
}

export function getMetaLineCount(content: PreviewContent): number {
  if (content.kind === "dir") return 8;
  return 0;
}