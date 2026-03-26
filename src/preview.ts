import fs from "fs";
import path from "path";
import chalk from "chalk";
import { w, at, C, R, visibleLen, NAVBAR_ROWS } from "./tui";
import { spawn } from "child_process";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "tiff", "tif"]);

let _fehPid: number | null = null;

function killFeh(): void {
  if (_fehPid) {
    try {
      process.kill(_fehPid, "SIGTERM");
    } catch {}
    _fehPid = null;
  }
}

function showImageWithFeh(fullPath: string, width: number, height: number): void {
  killFeh();
  try {
    const screenW = 1920;
    const screenH = 1080;

    const maxW = Math.floor(screenW * 0.6);
    const maxH = Math.floor(screenH * 0.8);

    let scale = 1;
    if (width > maxW) scale = Math.min(scale, maxW / width);
    if (height > maxH) scale = Math.min(scale, maxH / height);

    const imgW = Math.floor(width * scale);
    const imgH = Math.floor(height * scale);

    const xOffset = Math.floor((screenW - imgW) / 2);
    const yOffset = Math.floor((screenH - imgH) / 2);

    const child = spawn("feh", [
      "--borderless",
      "--hide-pointer",
      "--geometry", `${imgW}x${imgH}+${xOffset}+${yOffset}`,
      "--name", "fsh-preview",
      "--scale-down",
      "--no-menus",
      "--no-embed",
      "--auto-zoom",
      fullPath,
    ], {
      detached: true,
      stdio: "ignore",
    });
    _fehPid = child.pid!;
  } catch {}
}

export function closeImagePreview(): void {
  killFeh();
}

export function openImageWithFeh(fullPath: string): void {
  try {
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).slice(1).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return;

    let width = 0, height = 0;

    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      let i = 3;
      while (i < buf.length - 1) {
        if (buf[i] === 0xff && buf[i+1] >= 0xc0 && buf[i+1] <= 0xc3) {
          height = buf.readUInt16BE(i + 5);
          width = buf.readUInt16BE(i + 7);
          break;
        }
        if (buf[i] !== 0xff) { i++; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (len < 2) break;
        i += 2 + len;
      }
    } else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      width = buf.readUInt16LE(6);
      height = buf.readUInt16LE(8);
    } else if (buf[0] === 0x42 && buf[1] === 0x4d) {
      width = buf.readUInt32LE(18);
      height = Math.abs(buf.readInt32LE(22));
    }

    if (width > 0 && height > 0) {
      showImageWithFeh(fullPath, width, height);
    } else {
      showImageWithFeh(fullPath, 800, 600);
    }
  } catch {}
}

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
  | { kind: "image";  fullPath: string; meta: FileMeta; width: number; height: number }
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

function isImageExt(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0 && width < 10000 && height < 10000) {
      return { width, height };
    }
  }

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 3;
    while (i < buf.length - 1) {
      if (buf[i] === 0xff && buf[i+1] >= 0xc0 && buf[i+1] <= 0xc3) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        if (width > 0 && height > 0 && width < 10000 && height < 10000) {
          return { width, height };
        }
      }
      if (buf[i] !== 0xff) { i++; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }

  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    const width = buf.readUInt16LE(6);
    const height = buf.readUInt16LE(8);
    if (width > 0 && height > 0 && width < 10000 && height < 10000) {
      return { width, height };
    }
  }

  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    const width = buf.readInt32LE(18);
    const height = buf.readInt32LE(22);
    if (width > 0 && Math.abs(height) > 0 && width < 10000 && Math.abs(height) < 10000) {
      return { width, height: Math.abs(height) };
    }
  }

  return null;
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
  if (stat.size > 10*1024*1024)    return { kind:"binary", meta };
  let buf: Buffer;
  try { buf = fs.readFileSync(fullPath); } catch { return { kind:"binary", meta }; }
  if (isImageExt(meta.ext)) {
    const dims = getImageDimensions(buf);
    if (dims) {
      return { kind: "image", fullPath, meta, width: dims.width, height: dims.height };
    }
  }
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

function truncateAnsi(str: string, maxVisible: number): string {
  let visible = 0; let out = ""; let i = 0;
  while (i < str.length) {
    if (str[i] === "\x1b") {
      const end = str.indexOf("m", i);
      if (end !== -1) { out += str.slice(i, end + 1); i = end + 1; continue; }
    }
    if (visible >= maxVisible) break;
    out += str[i]; visible++; i++;
  }
  return out + chalk.reset("");
}

function padLine(l: string, width: number): string {
  const vl = visibleLen(l);
  if (vl > width) return truncateAnsi(l, width - 1) + chalk.dim("…");
  if (vl < width) return l + " ".repeat(width - vl);
  return l;
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

  const wasImage = state.content?.kind === "image";
  const isImage = IMAGE_EXTS.has(path.extname(fullPath).slice(1).toLowerCase());

  if (wasImage && !isImage) {
    killFeh();
  }

  state.path    = fullPath;
  state.content = buildPreview(fullPath);
  state.scrollTop = 0;
}

export function forceUpdatePreview(state: PreviewState, fullPath: string): void {
  const wasImage = state.content?.kind === "image";
  const isImage = IMAGE_EXTS.has(path.extname(fullPath).slice(1).toLowerCase());

  if (wasImage && !isImage) {
    killFeh();
  }

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
  if (content.kind === "image")  return 12;
  return 1;
}

export function renderPreviewLines(state: PreviewState, width: number): string[] {
  if (!state.content) return [chalk.dim("  no preview")];
  return renderContent(state.content, width);
}

function renderContent(content: PreviewContent, width: number): string[] {
  if (content.kind === "empty")  return [padLine(chalk.dim("  (nothing here)"), width)];
  if (content.kind === "binary") return [padLine(chalk.dim("  binary file"), width), ...renderMeta(content.meta, width)];

  if (content.kind === "image") {
    const lines: string[] = [];
    lines.push(chalk.blue.bold("  image  "));
    lines.push(...renderMeta(content.meta, width));
    lines.push(chalk.dim(`  ${content.width}×${content.height}`));
    return lines;
  }

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
    const num = chalk.dim(String(i+1).padStart(4) + " ");
    out.push(padLine(num + colorFn(rawLines[i]), width));
  }
  return out;
}

export function renderBrowseLines(
  content:  PreviewContent,
  browseIdx: number,
  width:    number,
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
    const line = lines[state.scrollTop + i] ?? "";
    out += at(startR + i, divCol) + chalk.dim("│") + padLine(line, pvW);
  }
  w(out);

}

export function drawOverlayPreview(
  state:     PreviewState,
  _navRows:  number,
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
    out += at(startR + 1 + i, 1) + " " + padLine(line, cols - 2) + " ";
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

