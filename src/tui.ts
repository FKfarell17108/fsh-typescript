import chalk from "chalk";

export const w   = process.stdout.write.bind(process.stdout);
export const at  = (r: number, c: number) => `\x1b[${r};${c}H`;
export const clr = () => `\x1b[2K`;
export const C   = () => process.stdout.columns || 80;
export const R   = () => process.stdout.rows    || 24;

export const NAVBAR_ROWS = 3;
export const FOOTER_ROWS = 0;
export function getNR(): number { return 0; }

export type NavItemColor = "default" | "green" | "yellow" | "red" | "cyan";
export type NavItem = { key: string; label: string; pri?: number; color?: NavItemColor; };
export type NavRows = NavItem[][];

export function visibleLen(str: string): number {
  return str.replace(/\x1b\[[0-9;]*[\x40-\x7e]/g, "").length;
}

export function padOrTrim(str: string, width: number): string {
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

function colorKeyBlock(keyStr: string, color: NavItemColor): string {
  switch (color) {
    case "green":  return chalk.bgGreen.black.bold(` ${keyStr} `);
    case "yellow": return chalk.bgYellow.black.bold(` ${keyStr} `);
    case "red":    return chalk.bgRed.white.bold(` ${keyStr} `);
    case "cyan":   return chalk.bgCyan.black.bold(` ${keyStr} `);
    default:       return chalk.bgWhite.black.bold(` ${keyStr} `);
  }
}

function renderNavRow(items: NavItem[], cols: number): string {
  if (items.length === 0) return chalk.bgBlack(" ".repeat(cols));

  const n         = items.length;
  const keyW      = Math.max(items.reduce((m, it) => Math.max(m, it.key.length), 0), 3);
  const keyBlockW = keyW + 2;
  const slotW     = Math.floor(cols / n);
  const lastSlotW = cols - slotW * (n - 1);
  let   out       = "";

  for (let i = 0; i < n; i++) {
    const slotWidth = i === n - 1 ? lastSlotW : slotW;
    const { key, label, color = "default" } = items[i];
    const keyPad    = Math.max(0, keyW - key.length);
    const keyLeft   = Math.floor(keyPad / 2);
    const keyRight  = keyPad - keyLeft;
    const keyStr    = " ".repeat(keyLeft) + key + " ".repeat(keyRight);
    const keyBlock  = colorKeyBlock(keyStr, color);
    const labAvail  = Math.max(0, slotWidth - keyBlockW - 1);
    const truncated = label.length > labAvail
      ? label.slice(0, Math.max(0, labAvail - 1)) + "…"
      : label;
    const fill = Math.max(0, labAvail - truncated.length);
    out += keyBlock + chalk.bgBlack.white(" " + truncated + " ".repeat(fill));
  }

  return out;
}

const MAX_NAV_ROWS = 2;

export function drawNavbar(rows: NavRows): void {
  const cols = C();
  let   out  = "";

  if (rows.length === 0) {
    out += at(1, 1) + clr() + chalk.bgBlack(" ".repeat(cols));
    out += at(2, 1) + clr() + chalk.dim("─".repeat(cols));
    for (let r = 3; r <= MAX_NAV_ROWS + 1; r++) {
      out += at(r, 1) + clr();
    }
    w(out);
    return;
  }

  for (let r = 0; r < rows.length; r++) {
    out += at(r + 1, 1) + clr() + renderNavRow(rows[r], cols);
  }

  out += at(rows.length + 1, 1) + clr() + chalk.dim("─".repeat(cols));

  for (let r = rows.length + 2; r <= MAX_NAV_ROWS + 1; r++) {
    out += at(r, 1) + clr();
  }

  w(out);
}

export function drawBottomBar(left: string, right: string): void {
  const cols = C();
  const row  = R();
  const ls   = left  ? "  " + left  : "";
  const rs   = right ? right + "  " : "";
  const gap  = Math.max(0, cols - visibleLen(ls) - visibleLen(rs));
  w(at(row, 1) + clr() + chalk.dim(ls) + " ".repeat(gap) + chalk.dim(rs));
}

export function drawFooter(
  _footerRow: number,
  total: number,
  scrollTop: number,
  vis: number,
  statLeft?: string
): void {
  const more = total - (scrollTop + vis);
  const rs   = total > vis ? (more > 0 ? `↓ ${more} more` : "end") : "";
  drawBottomBar(statLeft ?? "", rs);
}

export function kb(s: string): string {
  return chalk.bgGray.white.bold(` ${s} `);
}

export function enterAlt(): void    { w("\x1b[?1049h\x1b[?25l"); }
export function exitAlt(): void     { w("\x1b[?25h\x1b[?1049l\x1b[0m"); }
export function clearScreen(): void { w("\x1b[2J"); }