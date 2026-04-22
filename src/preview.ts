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
    } catch { }
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
  } catch { }
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
        if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) {
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
  } catch { }
}

export const SPLIT_THRESHOLD = 110;
export const PREVIEW_RATIO = 0.4;
export const OVERLAY_LINES = 12;

export type PreviewMode = "split" | "overlay";
export type PreviewPref = "auto" | "split" | "overlay";

export function getPreviewMode(pref: PreviewPref): PreviewMode {
  if (pref === "split") return "split";
  if (pref === "overlay") return "overlay";
  return C() >= SPLIT_THRESHOLD ? "split" : "overlay";
}

export function previewCols(): number { return Math.floor(C() * PREVIEW_RATIO); }
export function listCols(): number { return C() - previewCols() - 1; }

export type DirEntry = { name: string; isDir: boolean; };

export type PreviewContent =
  | { kind: "text"; lines: string[]; totalLines: number; meta: FileMeta }
  | { kind: "binary"; meta: FileMeta }
  | { kind: "dir"; entries: DirEntry[]; total: number; meta: DirMeta }
  | { kind: "image"; fullPath: string; meta: FileMeta; width: number; height: number }
  | { kind: "empty" };

export type FileMeta = { size: string; modified: string; perms: string; ext: string; };
export type DirMeta = { totalItems: number; dirs: number; files: number; sizeStr: string; };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtPerms(mode: number): string {
  const s = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  return s[(mode >> 6) & 7] + s[(mode >> 3) & 7] + s[mode & 7];
}

function fmtDate(d: Date): string {
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
      if (buf[i] === 0xff && buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) {
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
      try { if (e.isDirectory()) total += dirSize(full, depth + 1); else total += fs.statSync(full).size; } catch { }
    }
  } catch { }
  return total;
}

export function buildPreview(fullPath: string): PreviewContent {
  let stat: fs.Stats;
  try { stat = fs.statSync(fullPath); } catch { return { kind: "empty" }; }

  if (stat.isDirectory()) {
    let entries: DirEntry[] = []; let dirs = 0; let files = 0;
    try {
      const raw = fs.readdirSync(fullPath, { withFileTypes: true });
      dirs = raw.filter(e => e.isDirectory()).length;
      files = raw.filter(e => !e.isDirectory()).length;
      entries = raw
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
        .map(e => ({ name: e.name, isDir: e.isDirectory() }));
    } catch { }
    return { kind: "dir", entries, total: dirs + files, meta: { totalItems: dirs + files, dirs, files, sizeStr: fmtSize(dirSize(fullPath)) } };
  }

  const meta: FileMeta = {
    size: fmtSize(stat.size),
    modified: fmtDate(new Date(stat.mtimeMs)),
    perms: fmtPerms(stat.mode & 0o777),
    ext: path.extname(fullPath).slice(1).toLowerCase(),
  };

  if (stat.size === 0) return { kind: "text", lines: [""], totalLines: 0, meta };
  if (stat.size > 10 * 1024 * 1024) return { kind: "binary", meta };
  let buf: Buffer;
  try { buf = fs.readFileSync(fullPath); } catch { return { kind: "binary", meta }; }
  if (isImageExt(meta.ext)) {
    const dims = getImageDimensions(buf);
    if (dims) {
      return { kind: "image", fullPath, meta, width: dims.width, height: dims.height };
    }
  }
  if (isBinary(buf)) return { kind: "binary", meta };
  const lines = buf.toString("utf8").split("\n");
  return { kind: "text", lines, totalLines: lines.length, meta };
}

const TEXT_COLORS: Record<string, (s: string) => string> = {
  ts: chalk.hex("#6EC6BF"), js: chalk.hex("#FFD580"), tsx: chalk.hex("#6EC6BF"), jsx: chalk.hex("#FFD580"),
  json: chalk.hex("#AEDD87"), md: chalk.hex("#D4A9F5"), py: chalk.hex("#FFD580"),
  sh: chalk.hex("#AEDD87"), bash: chalk.hex("#AEDD87"), css: chalk.hex("#70D4FF"),
  html: chalk.hex("#FFA878"), xml: chalk.hex("#FFA878"), yml: chalk.hex("#FF9E64"),
  yaml: chalk.hex("#FF9E64"), toml: chalk.hex("#FF9E64"), env: chalk.hex("#FF9E64"),
  rs: chalk.hex("#FFA878"), go: chalk.hex("#70D4FF"), java: chalk.hex("#F5C542"),
  c: chalk.hex("#B0B8D8"), cpp: chalk.hex("#B0B8D8"), h: chalk.hex("#B0B8D8"),
  rb: chalk.hex("#FF7B8A"), php: chalk.hex("#D4A9F5"), sql: chalk.hex("#5BC8F5"),
  log: chalk.hex("#888FA8"), txt: chalk.white,
};
function lineColor(ext: string): (s: string) => string { return TEXT_COLORS[ext] ?? chalk.white; }
export function previewLineColor(ext: string): (s: string) => string { return lineColor(ext); }

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
  if (vl > width) {
    return truncateAnsi(l, width - 1) + chalk.dim("…");
  }
  if (vl < width) return l + " ".repeat(width - vl);
  return l;
}

function renderMeta(meta: FileMeta, width: number, fullPath: string): string[] {
  const d = chalk.dim; const v = chalk.white;
  const home = process.env.HOME ?? "";
  const displayPath = fullPath.startsWith(home) ? "~" + fullPath.slice(home.length) : fullPath;

  return [
    d("─".repeat(width)),
    d("  size      ") + v(meta.size),
    d("  modified  ") + v(meta.modified),
    d("  path      ") + v(displayPath),
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
  scrollLeft: number;
  cursorRow: number;
  cursorCol: number;
  isPreviewMode: boolean;
  path: string;
  content: PreviewContent | null;
};

export function makePreviewState(): PreviewState {
  return { scrollTop: 0, scrollLeft: 0, cursorRow: 0, cursorCol: 0, isPreviewMode: false, path: "", content: null };
}

export function updatePreview(state: PreviewState, fullPath: string): void {
  if (state.path === fullPath) return;

  const wasImage = state.content?.kind === "image";
  const isImage = IMAGE_EXTS.has(path.extname(fullPath).slice(1).toLowerCase());

  if (wasImage && !isImage) {
    killFeh();
  }

  state.path = fullPath;
  state.content = buildPreview(fullPath);
  state.scrollTop = 0;
  state.scrollLeft = 0;
  state.cursorRow = 0;
  state.cursorCol = 0;
}

export function forceUpdatePreview(state: PreviewState, fullPath: string): void {
  const wasImage = state.content?.kind === "image";
  const isImage = IMAGE_EXTS.has(path.extname(fullPath).slice(1).toLowerCase());

  if (wasImage && !isImage) {
    killFeh();
  }

  state.path = fullPath;
  state.content = buildPreview(fullPath);
  state.scrollTop = 0;
  state.scrollLeft = 0;
  state.cursorRow = 0;
  state.cursorCol = 0;
}

export function movePreviewCursor(state: PreviewState, dRow: number, dCol: number, visH: number, bodyW: number): void {
  if (!state.content) return;
  if (state.content.kind !== "text") {
    if (dRow !== 0) state.scrollTop = Math.max(0, state.scrollTop + dRow);
    return;
  }
  
  const rawLines = state.content.lines;
  
  if (dCol !== 0) {
    if (dCol > 0) {
      const lineLen = rawLines[state.cursorRow]?.length ?? 0;
      if (state.cursorCol + dCol > lineLen) {
        if (state.cursorRow < rawLines.length - 1) {
          state.cursorRow++;
          state.cursorCol = 0;
        } else {
          state.cursorCol = lineLen;
        }
      } else {
        state.cursorCol += dCol;
      }
    } else {
      if (state.cursorCol + dCol < 0) {
        if (state.cursorRow > 0) {
          state.cursorRow--;
          state.cursorCol = rawLines[state.cursorRow]?.length ?? 0;
        } else {
          state.cursorCol = 0;
        }
      } else {
        state.cursorCol += dCol;
      }
    }
  }

  if (dRow !== 0) {
    state.cursorRow = Math.max(0, Math.min(state.cursorRow + dRow, rawLines.length - 1));
    const maxLen = rawLines[state.cursorRow]?.length ?? 0;
    state.cursorCol = Math.min(state.cursorCol, maxLen);
  }

  // Sync scroll with cursor
  if (state.cursorRow < state.scrollTop) {
    state.scrollTop = state.cursorRow;
  } else if (state.cursorRow >= state.scrollTop + visH) {
    state.scrollTop = state.cursorRow - visH + 1;
  }

  if (state.cursorCol < state.scrollLeft) {
    state.scrollLeft = state.cursorCol;
  } else if (state.cursorCol >= state.scrollLeft + bodyW) {
    state.scrollLeft = state.cursorCol - bodyW + 1;
  }
}

export function getPreviewHeaderLength(content: PreviewContent): number {
  if (content.kind === "text" || content.kind === "binary") return content.meta.ext ? 7 : 6;
  if (content.kind === "dir") return 7;
  if (content.kind === "image") return content.meta.ext ? 8 : 7;
  return 0;
}

export type RenderedPreview = { header: string[]; body: string[] };

export function renderPreviewLines(state: PreviewState, width: number): RenderedPreview {
  if (!state.content) return { header: [], body: [chalk.dim("  no preview")] };
  return renderContent(state.content, width, state.path, state);
}

function renderContent(content: PreviewContent, width: number, fullPath: string, state: PreviewState): RenderedPreview {
  const scrollLeft = state.scrollLeft;
  if (content.kind === "empty") return { header: [], body: [padLine(chalk.dim("  (nothing here)"), width)] };
  if (content.kind === "binary") return { header: [padLine(chalk.dim("  binary file"), width), ...renderMeta(content.meta, width, fullPath)], body: [] };

  if (content.kind === "dir") {
    const header = [
      padLine(chalk.blue.bold("  " + path.basename(fullPath) + "/"), width),
      ...renderDirMeta(content.meta, width)
    ];
    const body: string[] = [];
    if (content.total === 0) {
      body.push(padLine(chalk.dim("  (empty directory)"), width));
    } else {
      for (const e of content.entries) {
        const icon = e.isDir ? "▸ " : "  ";
        const hidden = e.name.startsWith(".");
        const nameC = e.isDir ? (hidden ? chalk.cyan : chalk.blue) : (hidden ? chalk.dim : chalk.white);
        body.push(padLine("  " + (e.isDir ? chalk.blue(icon) : icon) + nameC(e.name), width));
      }
    }
    return { header, body };
  }

  if (content.kind === "image") {
    const header = [
      padLine(chalk.blue.bold("  " + path.basename(fullPath)), width),
      ...renderMeta(content.meta, width, fullPath),
      padLine(chalk.dim(`  Dimensions: ${content.width}x${content.height}`), width)
    ];
    return { header, body: [] };
  }

  const { lines: rawLines, meta } = content;
  const colorFn = lineColor(meta.ext);
  const header = [
    padLine(chalk.blue.bold("  " + path.basename(fullPath)), width),
    ...renderMeta(meta, width, fullPath)
  ];

  const body: string[] = [];
  if (rawLines.length === 0 || (rawLines.length === 1 && rawLines[0] === "")) {
    body.push(padLine(chalk.dim("  (empty file)"), width));
    return { header, body };
  }

  const numW = 5;
  const bodyW = Math.max(1, width - numW);
  for (let i = 0; i < rawLines.length; i++) {
    const num = chalk.dim(String(i + 1).padStart(4) + " ");
    const raw = rawLines[i];
    
    let visualLine = raw;
    if (state.isPreviewMode && i === state.cursorRow && state.cursorCol >= visualLine.length) {
      visualLine = visualLine.padEnd(state.cursorCol + 1, " ");
    }
    
    let sliced = visualLine.slice(scrollLeft, scrollLeft + bodyW);
    sliced = sliced.padEnd(bodyW, " ");

    if (state.isPreviewMode && i === state.cursorRow) {
      const c = state.cursorCol - scrollLeft;
      if (c >= 0 && c < bodyW) {
        const left = sliced.slice(0, c);
        const char = sliced[c];
        const right = sliced.slice(c + 1);
        const coloredLine = colorFn(left) + chalk.bgWhite.black(char) + colorFn(right);
        body.push(num + coloredLine);
      } else {
        body.push(num + colorFn(sliced));
      }
    } else {
      body.push(num + colorFn(sliced));
    }
  }
  return { header, body };
}

export function drawSplitPreview(
  state: PreviewState,
  navRows: number,
  listW: number,
  browseIdx?: number,
): void {
  const pvW = C() - listW - 1;
  const startR = navRows + 2;
  const endR = R() - 1;
  const visH = Math.max(1, endR - startR + 1);
  const divCol = listW + 1;

  const rendered = browseIdx !== undefined && state.content?.kind === "dir"
    ? buildBrowseLines(state, browseIdx, pvW, state.path)
    : renderPreviewLines(state, pvW);

  const bodyVisH = Math.max(0, visH - rendered.header.length);
  const maxScroll = Math.max(0, rendered.body.length - bodyVisH);
  state.scrollTop = Math.max(0, Math.min(state.scrollTop, maxScroll));

  let out = "";
  let r = 0;
  for (let i = 0; i < rendered.header.length && r < visH; i++) {
    out += at(startR + r, divCol) + chalk.dim("│") + padLine(rendered.header[i], pvW);
    r++;
  }
  for (let i = 0; r < visH; i++) {
    const line = rendered.body[state.scrollTop + i] ?? " ".repeat(pvW);
    out += at(startR + r, divCol) + chalk.dim("│") + padLine(line, pvW);
    r++;
  }
  w(out);
}

export function drawOverlayPreview(
  state: PreviewState,
  _navRows: number,
  browseIdx?: number,
): void {
  const cols = C();
  const startR = R() - OVERLAY_LINES - 1;
  const visH = OVERLAY_LINES;

  const rendered = browseIdx !== undefined && state.content?.kind === "dir"
    ? buildBrowseLines(state, browseIdx, cols - 2, state.path)
    : renderPreviewLines(state, cols - 2);

  const bodyVisH = Math.max(0, visH - rendered.header.length);
  const maxScroll = Math.max(0, rendered.body.length - bodyVisH);
  state.scrollTop = Math.max(0, Math.min(state.scrollTop, maxScroll));

  let out = "";
  out += at(startR, 1) + chalk.dim("─".repeat(cols));
  let r = 0;
  for (let i = 0; i < rendered.header.length && r < visH; i++) {
    out += at(startR + 1 + r, 1) + " " + padLine(rendered.header[i], cols - 2) + " ";
    r++;
  }
  for (let i = 0; r < visH; i++) {
    const line = rendered.body[state.scrollTop + i] ?? " ".repeat(cols - 2);
    out += at(startR + 1 + r, 1) + " " + padLine(line, cols - 2) + " ";
    r++;
  }
  w(out);
}

export function buildBrowseLines(state: PreviewState, browseIdx: number, width: number, fullPath: string): RenderedPreview {
  const content = state.content!;
  if (content.kind !== "dir") return renderContent(content, width, fullPath, state);
  
  const header = [
    padLine(chalk.blue.bold("  " + path.basename(fullPath) + "/"), width),
    ...renderDirMeta(content.meta, width)
  ];

  const body: string[] = [];
  if (content.total === 0) {
    body.push(padLine(chalk.dim("  (empty directory)"), width));
    return { header, body };
  }

  for (let i = 0; i < content.entries.length; i++) {
    const e = content.entries[i];
    const icon = e.isDir ? "▸ " : "  ";
    const hidden = e.name.startsWith(".");
    const nameC = e.isDir ? (hidden ? chalk.cyan : chalk.blue) : (hidden ? chalk.dim : chalk.white);
    const isCur = i === browseIdx;

    if (isCur) {
      const raw = "  " + icon + e.name;
      body.push(chalk.bgWhite.black.bold(padLine(raw, width)));
    } else {
      const coloredIcon = e.isDir ? chalk.blue(icon) : icon;
      body.push(padLine("  " + coloredIcon + nameC(e.name), width));
    }
  }
  return { header, body };
}

export function getDirEntries(content: PreviewContent): DirEntry[] {
  if (content.kind === "dir") return content.entries;
  return [];
}

export function getMetaLineCount(content: PreviewContent): number {
  if (content.kind === "dir") return 8;
  return 0;
}