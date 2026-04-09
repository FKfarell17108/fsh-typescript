import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import chalk from "chalk";
import { w, at, clr, C, R, drawNavbar, NavItem, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";
import { HistoryEntry } from "./historyManager";
import { getAllAliases } from "./aliases";
import { moveToTrash } from "./trash"

type ResultKind = "history" | "file" | "dir" | "executable" | "builtin" | "alias";
interface SearchResult { kind: ResultKind; value: string; display: string; sub: string; fullPath: string; }

const BUILTINS = ["exit", "echo", "type", "pwd", "cd", "ls", "dir", "alias", "unalias", "clear", "history", "trash", "fshrc", "neofetch"];
const EDITOR_CANDIDATES = ["nvim", "vim", "vi", "nano", "emacs", "micro", "hx", "helix", "code", "gedit"];
const CATEGORY_ORDER: ResultKind[] = ["history", "dir", "file", "builtin", "alias", "executable"];
const CATEGORY_LABEL: Record<ResultKind, string> = { history: "Command history", dir: "Directories", file: "Files", builtin: "Builtins", alias: "Aliases", executable: "Executables" };
const CATEGORY_ICON: Record<ResultKind, string> = { history: "  ", dir: "▸ ", file: "  ", builtin: "  ", alias: "⚡ ", executable: "  " };

function shortenPath(p: string): string { const home = process.env.HOME ?? ""; return p.startsWith(home) ? "~" + p.slice(home.length) : p; }

function fuzzyScore(query: string, target: string): number {
  if (query === "") return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const tNormalized = t.replace(/[-_\s\.]/g, "");
  const qNormalized = q.replace(/[\s\.]/g, "");

  const tokens = q.split(/\s+/).filter(token => token.length > 0);
  if (tokens.length === 0) return 1;

  let totalScore = 0;
  let matchesAllTokens = true;

  for (const token of tokens) {
    if (t.includes(token) || tNormalized.includes(token)) {
      totalScore += 20;

      if (t.startsWith(token) || t.includes("-" + token) || t.includes("_" + token) || t.includes("." + token)) {
        totalScore += 30;
      }
    } else {
      matchesAllTokens = false;
      break;
    }
  }

  if (!matchesAllTokens) return 0;

  if (tNormalized.includes(qNormalized)) {
    totalScore += 30;
  }

  return totalScore;
}

function getInstalledEditors(): string[] { return EDITOR_CANDIDATES.filter(e => { try { execFileSync("which", [e], { stdio: "ignore" }); return true; } catch { return false; } }); }

const SKIP_DIRS = new Set(["node_modules", ".git", ".svn", ".hg", "dist", "build", "out", ".next", ".nuxt", "__pycache__", ".pytest_cache", ".mypy_cache", ".cache", ".npm", ".yarn", "proc", "sys", "dev"]);

function searchFilesystem(query: string, rootDirs: string[], maxResults = 40): SearchResult[] {
  const results: { r: SearchResult; score: number }[] = []; const visited = new Set<string>();
  function walk(dir: string, depth: number) {
    if (depth > 4 || results.length > maxResults * 2) return; if (visited.has(dir)) return; visited.add(dir);
    let entries: fs.Dirent[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".") && depth > 1) continue;
      const score = fuzzyScore(query, e.name);
      if (score > 0) {
        const full = path.join(dir, e.name);
        const isDir = e.isDirectory();
        const display = isDir ? e.name + "/" : e.name;
        results.push({ r: { kind: isDir ? "dir" : "file", value: e.name, display, sub: shortenPath(dir), fullPath: full }, score });
      }
      if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), depth + 1);
    }
  }
  for (const root of rootDirs) walk(root, 0);
  return results.sort((a, b) => b.score - a.score).slice(0, maxResults).map(x => x.r);
}

function searchHistory(query: string, entries: HistoryEntry[]): SearchResult[] {
  return entries.map(e => ({ e, score: fuzzyScore(query, e.cmd) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 20)
    .map(({ e }) => ({ kind: "history" as ResultKind, value: e.cmd, display: e.cmd, fullPath: "", sub: e.ts ? new Date(e.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "" }));
}

function searchExecutables(query: string): SearchResult[] {
  if (query.length < 2) return []; const seen = new Set<string>(); const hits: { name: string; score: number; dir: string }[] = [];
  for (const dir of (process.env.PATH ?? "").split(":")) { try { for (const entry of fs.readdirSync(dir)) { const score = fuzzyScore(query, entry); if (score > 0 && !seen.has(entry)) { seen.add(entry); hits.push({ name: entry, score, dir }); } } } catch { } }
  return hits.sort((a, b) => b.score - a.score).slice(0, 15).map(h => ({ kind: "executable" as ResultKind, value: h.name, display: h.name, fullPath: path.join(h.dir, h.name), sub: shortenPath(h.dir) }));
}

function searchBuiltins(query: string): SearchResult[] { return BUILTINS.filter(b => fuzzyScore(query, b) > 0).map(b => ({ kind: "builtin" as ResultKind, value: b, display: b, fullPath: "", sub: "fsh builtin" })); }
function searchAliases(query: string): SearchResult[] { const results: SearchResult[] = []; for (const [name, val] of getAllAliases()) { if (fuzzyScore(query, name) > 0) results.push({ kind: "alias" as ResultKind, value: name, display: name, fullPath: "", sub: val }); } return results; }

type Row = { kind: "header"; category: ResultKind; count: number } | { kind: "result"; result: SearchResult };

function buildRows(grouped: Map<ResultKind, SearchResult[]>): Row[] {
  const rows: Row[] = [];
  for (const cat of CATEGORY_ORDER) { const items = grouped.get(cat); if (!items || !items.length) continue; rows.push({ kind: "header", category: cat, count: items.length }); for (const r of items) rows.push({ kind: "result", result: r }); }
  return rows;
}

function kindColor(kind: ResultKind, hidden = false): (s: string) => string {
  switch (kind) {
    case "history": return chalk.white;
    case "dir": return hidden ? chalk.cyan : chalk.blue.bold;
    case "file": return hidden ? chalk.gray : chalk.white;
    case "builtin": return chalk.green.bold;
    case "alias": return chalk.green;
    case "executable": return chalk.hex("#C3E88D");
  }
}

export function showSearch(historyEntries: HistoryEntry[], onSelect: (value: string) => void, onCancel: () => void): void {
  const stdin = process.stdin;
  let query = ""; let cursorPos = 0; let selIdx = 0; let scrollTop = 0; let rows: Row[] = [];
  let previewScroll = 0;
  let inEditorPicker = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const home = process.env.HOME ?? ""; const cwd = process.cwd(); const rootDirs = Array.from(new Set([cwd, home])).filter(Boolean);

  const NAV: NavItem[] = [
    { key: "Nav", label: "Navigate" },
    { key: "Ent", label: "Select" },
    { key: "Esc", label: "Cancel" },
  ];

  function NR(): number { return 2; }
  function searchBarRow(): number { return NR() + 1; }
  function vis(): number { return Math.max(1, R() - NR() - 3); }
  function contentStart(): number { return NR() + 2; }
  function adjustScroll(): void { const v = vis(); if (selIdx < scrollTop) scrollTop = selIdx; if (selIdx >= scrollTop + v) scrollTop = selIdx - v + 1; }

  function runSearch(): void {
    const grouped = new Map<ResultKind, SearchResult[]>();
    if (query.length === 0) {
      grouped.set("history", historyEntries.slice(0, 30).map(e => ({ kind: "history" as ResultKind, value: e.cmd, display: e.cmd, fullPath: "", sub: e.ts ? new Date(e.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "" })));
    } else {
      const hist = searchHistory(query, historyEntries); const fsRes = searchFilesystem(query, rootDirs);
      const dirs = fsRes.filter(f => f.kind === "dir"); const files = fsRes.filter(f => f.kind === "file");
      const execs = searchExecutables(query); const bltns = searchBuiltins(query); const alsas = searchAliases(query);
      if (hist.length) grouped.set("history", hist); if (dirs.length) grouped.set("dir", dirs);
      if (files.length) grouped.set("file", files); if (bltns.length) grouped.set("builtin", bltns);
      if (alsas.length) grouped.set("alias", alsas); if (execs.length) grouped.set("executable", execs);
    }
    rows = buildRows(grouped); selIdx = 0; scrollTop = 0;
    const first = rows.findIndex(r => r.kind === "result"); if (first >= 0) selIdx = first; adjustScroll();
  }

  function totalResults(): number { return rows.filter(r => r.kind === "result").length; }
  function buildLeft(): string { return `Search  ${totalResults()} result${totalResults() === 1 ? "" : "s"}`; }
  function buildRight(): string { if (rows.length <= vis()) return ""; const more = rows.length - (scrollTop + vis()); return more > 0 ? `↓ ${more} more` : "end"; }

  function drawSearchBar(): void {
    const cols = C(); const sRow = searchBarRow();
    const prefix = chalk.bgBlack.white(" search ") + " ";
    const before = query.slice(0, cursorPos);
    const after = query.slice(cursorPos);
    const charAtCursor = after[0] || " ";
    const rest = after.slice(1);
    const cursor = chalk.bgWhite.black(charAtCursor);
    const line = prefix + chalk.white(before) + cursor + chalk.white(rest);
    const padLen = Math.max(0, cols - visibleLen(prefix) - query.length - 1);
    w(at(sRow, 1) + clr() + line + " ".repeat(padLen));
  }

  function drawResults(): void {
    const cs = contentStart(); const cols = C(); const v = vis(); let out = "";
    for (let i = 0; i < v; i++) {
      out += at(cs + i, 1) + clr();
      const row = rows[scrollTop + i];
      if (!row) continue;
      const active = (scrollTop + i) === selIdx;
      if (row.kind === "header") {
        const label = `  ${CATEGORY_LABEL[row.category]}  (${row.count})`;
        out += active ? chalk.bgYellow.black.bold(label.padEnd(cols)) : chalk.yellow.bold(label);
      } else {
        const r = row.result;
        const icon = CATEGORY_ICON[r.kind];
        const hidden = r.display.startsWith(".");
        const color = kindColor(r.kind, hidden);
        const subLen = visibleLen(r.sub);
        const maxDisp = Math.max(8, cols - icon.length - subLen - 6);
        const display = r.display.length > maxDisp ? r.display.slice(0, maxDisp - 1) + "…" : r.display;
        if (active) {
          const leftPart = "  " + icon + display;
          const fullRowText = leftPart.padEnd(cols - subLen - 2) + "  " + r.sub;
          out += chalk.bgWhite.black.bold(fullRowText.padEnd(cols));
        } else {
          const leftPart = ("  " + icon + display).padEnd(cols - subLen - 2);
          out += color(leftPart) + "  " + chalk.dim(r.sub);
        }
      }
    }

    for (let i = Math.max(0, rows.length - scrollTop); i < v; i++) out += at(cs + i, 1) + clr();
    if (rows.length === 0 && query.length > 0) out += at(cs, 1) + clr() + chalk.gray("  (no results)");

    w(out);
  }

  function render(): void { drawNavbar([NAV]); drawSearchBar(); drawResults(); drawBottomBar(buildLeft(), buildRight()); }
  function fullRedraw(): void { clearScreen(); runSearch(); render(); }
  function cleanup(): void { if (searchTimer) clearTimeout(searchTimer); process.stdout.removeListener("resize", onResize); stdin.removeAllListeners("data"); exitAlt(); }
  function scheduleSearch(): void { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => { runSearch(); render(); }, query.length < 2 ? 0 : 120); }

  function handleSelect(result: SearchResult): void {
    if (result.kind === "history" || result.kind === "builtin" || result.kind === "alias" || result.kind === "executable") { cleanup(); setTimeout(() => onSelect(result.value), 20); return; }
    if (result.kind === "dir") { showDirAction(result); return; }
    if (result.kind === "file") { showFileAction(result); return; }
  }

  function showDirAction(result: SearchResult): void {
    const full = result.fullPath;
    const actionNav: NavItem[] = [
      { key: "Ent", label: "cd into" },
      { key: "D", label: "Delete" },
      { key: "Esc", label: "Back" }
    ];
    function drawAction(): void {
      const nr = 3; const start = nr + 2; const avail = R() - nr - 2;
      drawNavbar([actionNav]); let out = ""; let ln = 0;
      function line(content: string) { if (ln >= avail) return; out += at(start + ln, 1) + clr() + content; ln++; }
      line(chalk.blue.bold("▸ " + result.display) + "  " + chalk.dim(result.sub)); line(chalk.dim("─".repeat(Math.min(C() - 2, 60))));
      try {
        const children = fs.readdirSync(full, { withFileTypes: true }).slice(0, avail - 3);
        if (!children.length) { line(chalk.gray("  (empty directory)")); }
        else {
          for (const c of children) line((c.isDirectory() ? chalk.blue("  ▸ ") : chalk.gray("    ")) + chalk.white(c.name + (c.isDirectory() ? "/" : "")));
          const total = fs.readdirSync(full).length; if (total > avail - 3) line(chalk.gray(`  ... and ${total - (avail - 3)} more`));
        }
      } catch { line(chalk.red("  cannot read directory")); }
      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();
      w(out); drawBottomBar(result.display, "");
    }
    const onAR = () => { clearScreen(); drawAction(); };
    process.stdout.removeListener("resize", onResize); process.stdout.on("resize", onAR); stdin.removeListener("data", onKey);
    function onActionKey(k: string): void {
      if (k === "\u001b") {
        stdin.removeListener("data", onActionKey);
        process.stdout.removeListener("resize", onAR);
        clearScreen();
        render();
        stdin.on("data", onKey);
        return;
      }

      if (k === "\u0003") { cleanup(); setTimeout(onCancel, 20); return; }

      if (k === "\r") {
        stdin.removeListener("data", onActionKey);
        process.stdout.removeListener("resize", onAR);
        try { process.chdir(full); } catch { }
        cleanup();
        setTimeout(() => onSelect(""), 20);
      }

      if (k.toLowerCase() === "d") {
        stdin.removeListener("data", onActionKey);
        process.stdout.removeListener("resize", onAR);
        showDeleteConfirm(result);
        return;
      }
    }
    stdin.on("data", onActionKey); clearScreen(); drawAction();
  }

  function showFileAction(result: SearchResult): void {
    const full = result.fullPath;
    const editors = getInstalledEditors();
    const EW = Math.max(...editors.map(e => e.length)) + 2;
    let eSelIdx = 0;
    inEditorPicker = false;

    const fileNav: NavItem[] = [
      { key: "Up/Dn", label: "Scroll" },
      { key: "Ent", label: "Open Editor" },
      { key: "D", label: "Delete" },
      { key: "Esc", label: "Back" }
    ];

    function drawFileAction(): void {
      const cols = C();
      const rowsCount = R();
      const start = 3;
      const avail = rowsCount - 6;

      drawNavbar([fileNav]);

      let out = "";
      let ln = 0;
      const stats = fs.statSync(full);
      const sizeStr = (stats.size / 1024).toFixed(1) + " KB";
      const modStr = stats.mtime.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

      const line = (content: string) => {
        if (ln >= avail) return;
        out += at(start + ln, 1) + clr() + content;
        ln++;
      };

      line(chalk.dim("  size     ") + chalk.white(sizeStr));
      line(chalk.dim("  modified ") + chalk.white(modStr));
      line(chalk.dim("  type     ") + chalk.white(path.extname(full).slice(1) || "file"));
      line(chalk.dim("─".repeat(cols)));

      try {
        const allLines = fs.readFileSync(full, "utf8").split("\n");
        const contentAvail = avail - ln;

        if (previewScroll > allLines.length - contentAvail) {
          previewScroll = Math.max(0, allLines.length - contentAvail);
        }

        const visibleLines = allLines.slice(previewScroll, previewScroll + contentAvail);
        for (let i = 0; i < visibleLines.length; i++) {
          const lineNum = chalk.dim((previewScroll + i + 1).toString().padStart(4) + " ");
          const contentText = visibleLines[i].length > cols - 7 ? visibleLines[i].slice(0, cols - 8) + "…" : visibleLines[i];
          line(lineNum + chalk.white(contentText));
        }
      } catch { line(chalk.gray("  (cannot read file)")); }

      for (let i = ln; i < avail; i++) out += at(start + i, 1) + clr();

      const infoRow = rowsCount - 2;
      const promptRow = rowsCount - 1;

      if (!inEditorPicker) {
        out += at(infoRow, 1) + clr() + chalk.white("  file: ") + chalk.white.bold(path.basename(full));
        out += at(promptRow, 1) + clr() + chalk.white("  Press ") + chalk.white("[") + chalk.blue.bold("Enter") + chalk.white("]") + chalk.white(" to open editor...");
      } else {
        out += at(infoRow, 1) + clr() + chalk.yellow.bold(`  Choose your editor code for open ${path.basename(full)}:`);
        let eLine = "  ";
        for (let i = 0; i < editors.length; i++) {
          const name = " " + editors[i] + " ";
          const paddedName = name.padEnd(EW + 2, " ");
          eLine += i === eSelIdx ? chalk.bgWhite.black.bold(paddedName) : chalk.cyan(paddedName);
        }
        out += at(promptRow, 1) + clr() + eLine;
      }

      w(out);
      drawBottomBar("", "");
    }

    const onFR = () => { clearScreen(); drawFileAction(); };
    process.stdout.on("resize", onFR);
    stdin.removeListener("data", onKey);

    function onFileKey(k: string): void {
      if (k === "\u001b" || k === "\u0003") {
        if (inEditorPicker) { inEditorPicker = false; drawFileAction(); return; }
        if (k.toLowerCase() === "d") {
          stdin.removeListener("data", onFileKey);
          process.stdout.removeListener("resize", onFR);
          showDeleteConfirm(result);
          return;
        }
        previewScroll = 0;
        stdin.removeListener("data", onFileKey);
        process.stdout.removeListener("resize", onFR);
        clearScreen(); render(); stdin.on("data", onKey);
        return;
      }

      const allLinesCount = fs.readFileSync(full, "utf8").split("\n").length;
      const visCount = R() - 10;

      if (k === "\u001b[A") { previewScroll = Math.max(0, previewScroll - 1); drawFileAction(); return; }
      if (k === "\u001b[B") {
        if (previewScroll + visCount < allLinesCount) {
          previewScroll++; drawFileAction();
        }
        return;
      }
      if (k === "\u001b[5~") { previewScroll = Math.max(0, previewScroll - 10); drawFileAction(); return; }
      if (k === "\u001b[6~") {
        if (previewScroll + visCount < allLinesCount) {
          previewScroll = Math.min(allLinesCount - visCount, previewScroll + 10);
          drawFileAction();
        }
        return;
      }

      if (k === "\r") {
        if (!inEditorPicker) {
          inEditorPicker = true;
          drawFileAction();
        } else {
          const chosen = editors[eSelIdx];
          stdin.removeListener("data", onFileKey);
          process.stdout.removeListener("resize", onFR);
          try { process.chdir(path.dirname(full)); } catch { }
          cleanup();
          setTimeout(() => onSelect(`${chosen} "${full}"`), 20);
        }
        return;
      }

      if (inEditorPicker) {
        if (k === "\u001b[C") { eSelIdx = Math.min(editors.length - 1, eSelIdx + 1); drawFileAction(); }
        else if (k === "\u001b[D") { eSelIdx = Math.max(0, eSelIdx - 1); drawFileAction(); }
      }
    }
    stdin.on("data", onFileKey); onFR();
  }

  function showDeleteConfirm(result: SearchResult): void {
    const full = result.fullPath;
    const confirmNav: NavItem[] = [
      { key: "Y", label: "Move to Trash", color: "yellow" },
      { key: "N/Esc", label: "Cancel", color: "green" }
    ];

    function drawConfirm(): void {
      drawNavbar([confirmNav]);
      let out = at(3, 1) + clr() + chalk.bold.red("  Move to Trash?");
      out += at(4, 1) + clr() + chalk.white(`  Are you sure you want to delete: `) + chalk.cyan(result.display);
      out += at(5, 1) + clr() + chalk.dim(`  Path: ${result.sub}`);
      w(out);
      drawBottomBar("Confirm Delete", "");
    }

    const onDR = () => { clearScreen(); drawConfirm(); };
    process.stdout.removeListener("resize", onResize);
    process.stdout.on("resize", onDR);
    stdin.removeListener("data", onKey);

    function onConfirmKey(k: string): void {
      const closeConfirm = () => {
        stdin.removeListener("data", onConfirmKey);
        process.stdout.removeListener("resize", onDR);
        process.stdout.on("resize", onResize);
        clearScreen();
        runSearch();
        render();
        stdin.on("data", onKey);
      };

      if (k.toLowerCase() === "y") {
        try {
          moveToTrash(full);
          closeConfirm();
        } catch (e) {
          w(at(R(), 1) + clr() + chalk.red(" Error: " + (e as Error).message));
          setTimeout(closeConfirm, 1000);
        }
      } else if (k === "\u001b" || k.toLowerCase() === "n" || k === "\u0003") {
        closeConfirm();
      }
    }

    stdin.on("data", onConfirmKey);
    clearScreen();
    drawConfirm();
  }

  function navigate(key: string): boolean {
    const total = rows.length; if (total === 0) return false; let next = selIdx;
    if (key === "\u001b[A") { next = selIdx - 1; while (next >= 0 && rows[next].kind === "header") next--; if (next < 0) return false; }
    else if (key === "\u001b[B") { next = selIdx + 1; while (next < total && rows[next].kind === "header") next++; if (next >= total) return false; }
    else { return false; }
    selIdx = next; adjustScroll(); return true;
  }

  function onResize(): void { clearScreen(); runSearch(); render(); }
  function onKey(k: string): void {
    if (k === "\u0003" || k === "\u001b") { cleanup(); setTimeout(onCancel, 20); return; }
    if (k === "\r") { const row = rows[selIdx]; if (row?.kind === "result") handleSelect(row.result); return; }
    if (navigate(k)) { render(); return; }
    if (k === "\u001b[D") {
      if (cursorPos > 0) { cursorPos--; render(); }
      return;
    }
    if (k === "\u001b[C") {
      if (cursorPos < query.length) { cursorPos++; render(); }
      return;
    }
    if (k === "\x7f" || k === "\u0008") {
      if (cursorPos > 0) {
        query = query.slice(0, cursorPos - 1) + query.slice(cursorPos);
        cursorPos--;
        scheduleSearch();
        render();
      }
      return;
    }
    if (k.length === 1 && k >= " ") {
      query = query.slice(0, cursorPos) + k + query.slice(cursorPos);
      cursorPos++;
      scheduleSearch();
      render();
      return;
    }
  }

  process.stdout.on("resize", onResize); stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  enterAlt(); fullRedraw();
}