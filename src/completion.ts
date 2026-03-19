import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getAllAliases } from "./aliases";
import { w, at, clr, C, R, NAVBAR_ROWS, FOOTER_ROWS, drawNavbar, drawFooter, kb, enterAlt, exitAlt, clearScreen, visibleLen } from "./tui";

const BUILTINS = [
  "exit", "echo", "type", "pwd", "cd", "ls", "dir", "alias", "unalias",
  "clear", "history", "trash", "fshrc", "neofetch",
];

export function getCandidates(line: string): { candidates: string[]; partial: string } {
  const tokens      = tokenizeLine(line);
  const isFirstWord = tokens.length === 0 || (tokens.length === 1 && !line.endsWith(" "));

  if (isFirstWord) {
    const partial = tokens[0] ?? "";
    return { candidates: getCommandCandidates(partial), partial };
  } else {
    const partial = line.endsWith(" ") ? "" : tokens[tokens.length - 1];
    const { candidates } = getFileCandidates(partial);
    return { candidates, partial };
  }
}

function getCommandCandidates(partial: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const b of BUILTINS) {
    if (b.startsWith(partial)) { candidates.push(b); seen.add(b); }
  }
  for (const name of getAllAliases().keys()) {
    if (name.startsWith(partial) && !seen.has(name)) { candidates.push(name); seen.add(name); }
  }
  for (const dir of (process.env.PATH ?? "").split(":")) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.startsWith(partial) || seen.has(entry)) continue;
        try {
          fs.accessSync(path.join(dir, entry), fs.constants.X_OK);
          candidates.push(entry);
          seen.add(entry);
        } catch {}
      }
    } catch {}
  }

  return candidates.sort();
}

export function getFileCandidates(partial: string): { candidates: string[]; baseDir: string; prefix: string } {
  let dir: string;
  let prefix: string;

  if (partial === "" || partial === ".") {
    dir = process.cwd(); prefix = "";
  } else if (partial.startsWith("~/")) {
    const home      = process.env.HOME ?? "";
    const rest      = partial.slice(2);
    const lastSlash = rest.lastIndexOf("/");
    dir    = lastSlash === -1 ? home : path.join(home, rest.slice(0, lastSlash));
    prefix = lastSlash === -1 ? rest  : rest.slice(lastSlash + 1);
  } else if (partial.includes("/")) {
    const lastSlash = partial.lastIndexOf("/");
    dir    = path.resolve(partial.slice(0, lastSlash) || "/");
    prefix = partial.slice(lastSlash + 1);
  } else {
    dir = process.cwd(); prefix = partial;
  }

  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch {}

  const candidates = entries
    .filter((e) => e.name.startsWith(prefix))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => {
      const name = e.name + (e.isDirectory() ? "/" : "");
      if (partial.startsWith("~/")) {
        const rest      = partial.slice(2);
        const lastSlash = rest.lastIndexOf("/");
        return (lastSlash === -1 ? "~/" : "~/" + rest.slice(0, lastSlash + 1)) + name;
      } else if (partial.includes("/")) {
        return partial.slice(0, partial.lastIndexOf("/") + 1) + name;
      }
      return name;
    });

  return { candidates, baseDir: dir, prefix };
}

export function commonPrefix(strs: string[]): string {
  if (strs.length === 0) return "";
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
}

export function showPicker(
  candidates: string[],
  onSelect: (chosen: string) => void,
  onCancel: () => void,
  onHistory?: () => void
) {
  if (candidates.length === 0) return onCancel();

  const stdin   = process.stdin;
  let selIdx    = 0;
  let scrollTop = 0;

  function colWidth(): number {
    const max = Math.max(...candidates.map((c) => c.length));
    return Math.max(max + 2, 16);
  }

  function perRow(): number {
    return Math.max(1, Math.floor(C() / colWidth()));
  }

  function totalRows(): number {
    return Math.ceil(candidates.length / perRow());
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

  function navRight(): string {
    return `${totalRows()}R × ${perRow()}C`;
  }

  function statLeft(): string {
    const dirs  = candidates.filter((c) => c.endsWith("/")).length;
    const cmds  = candidates.length - dirs;
    const parts: string[] = [];
    if (dirs > 0) parts.push(`${dirs} ${dirs === 1 ? "dir" : "dirs"}`);
    if (cmds > 0) parts.push(`${cmds} ${cmds === 1 ? "command" : "commands"}`);
    if (parts.length === 0) parts.push(`${candidates.length} items`);
    return parts.join("  ");
  }

  function buildNavHints(): string[] {
    const tr         = totalRows();
    const v          = vis();
    const scrollInfo = tr > v ? chalk.dim(` [row ${Math.floor(selIdx / perRow()) + 1}/${tr}]`) : "";
    const histHint   = onHistory ? kb("h") + chalk.gray(" history  ") : "";

    return [
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + histHint + kb("esc") + chalk.gray(" cancel") + scrollInfo,
      kb("↑↓←→") + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + histHint + kb("esc") + chalk.gray(" cancel") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ") + kb("enter") + chalk.gray(" select  ") + histHint + kb("esc") + chalk.gray(" cancel") + scrollInfo,
      kb("↑↓")   + chalk.gray(" move  ")               +                           histHint + kb("esc") + chalk.gray(" cancel") + scrollInfo,
      kb("esc")  + chalk.gray(" cancel"),
    ];
  }

  function buildNavbarStr(): string {
    const cols      = C();
    const rightStr  = " " + navRight() + " ";
    const rightLen  = visibleLen(rightStr);
    const available = cols - 2 - rightLen;

    const hints  = buildNavHints();
    let chosen   = hints[hints.length - 1];
    for (const h of hints) {
      if (visibleLen(h) <= available) { chosen = h; break; }
    }

    const leftPart  = padOrTrimLocal(" " + chosen, cols - rightLen);
    const rightPart = chalk.bgBlack.dim(rightStr);
    return at(1, 1) + clr() + chalk.bgBlack.white(leftPart) + rightPart +
           at(2, 1) + clr() + chalk.dim("─".repeat(cols));
  }

  function padOrTrimLocal(str: string, width: number): string {
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

  function buildFooterStr(): string {
    const cols     = C();
    const v        = vis();
    const tr       = totalRows();
    const more     = tr - (scrollTop + v);
    const leftStr  = "  " + statLeft();
    const leftLen  = visibleLen(leftStr);
    let rightStr   = "";
    if (tr > v) rightStr = more > 0 ? `  ↓ ${more} more  ` : "  (end)  ";
    const rightLen = visibleLen(rightStr);
    const gap      = Math.max(0, cols - leftLen - rightLen);
    return at(NAVBAR_ROWS + 1 + v, 1) + clr() +
           chalk.dim(leftStr) + " ".repeat(gap) + chalk.dim(rightStr);
  }

  function render() {
    const pr  = perRow();
    const cw  = colWidth();
    const v   = vis();
    let out   = buildNavbarStr();

    for (let row = 0; row < v; row++) {
      out += at(NAVBAR_ROWS + 1 + row, 1) + clr();
      const fileRow = scrollTop + row;
      let line = " ";
      for (let col = 0; col < pr; col++) {
        const i = fileRow * pr + col;
        if (i >= candidates.length) break;
        const name       = candidates[i];
        const padded     = name.padEnd(cw, " ");
        const isSelected = i === selIdx;
        const isDir      = name.endsWith("/");

        if (isSelected) {
          line += chalk.bgWhite.black.bold(padded);
        } else if (isDir) {
          line += name.startsWith(".") ? chalk.cyan(padded) : chalk.blue.bold(padded);
        } else {
          line += name.startsWith(".") ? chalk.gray(padded) : chalk.white(padded);
        }
      }
      out += line;
    }

    out += buildFooterStr();
    w(out);
  }

  function fullRedraw() {
    let out = "\x1b[2J";
    adjustScroll();
    w(out);
    render();
  }

  function cleanup() {
    process.stdout.removeListener("resize", onResize);
    stdin.removeAllListeners("data");
    if (stdin.isTTY) stdin.setRawMode(false);
    exitAlt();
  }

  function exit(chosen?: string) {
    cleanup();
    setTimeout(() => {
      if (chosen !== undefined) onSelect(chosen);
      else onCancel();
    }, 20);
  }

  function onResize() { fullRedraw(); }

  process.stdout.on("resize", onResize);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  stdin.on("data", (key: string) => {
    const pr = perRow();
    if (key === "\u0003" || key === "\u001b" || key === "\t") return exit();
    if (key === "\r") return exit(candidates[selIdx]);
    if (key === "h" && onHistory) { cleanup(); setTimeout(onHistory, 20); return; }

    let idx = selIdx;
    if (key === "\u001b[A") idx -= pr;
    if (key === "\u001b[B") idx += pr;
    if (key === "\u001b[C") idx += 1;
    if (key === "\u001b[D") idx -= 1;
    if (key === "\u001b[H") idx = 0;
    if (key === "\u001b[F") idx = candidates.length - 1;

    idx = Math.max(0, Math.min(candidates.length - 1, idx));
    if (idx !== selIdx) {
      selIdx = idx;
      adjustScroll();
      render();
    }
  });

  enterAlt();
  fullRedraw();
}

export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inDouble = false;
  let inSingle = false;

  for (const ch of line) {
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === " " && !inDouble && !inSingle) {
      if (current) { tokens.push(current); current = ""; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}