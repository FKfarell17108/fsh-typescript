import chalk from "chalk";

export const w   = process.stdout.write.bind(process.stdout);
export const at  = (r: number, c: number) => `\x1b[${r};${c}H`;
export const clr = () => `\x1b[2K`;
export const C   = () => process.stdout.columns || 80;
export const R   = () => process.stdout.rows    || 24;

export const NAVBAR_ROWS = 3;
export const FOOTER_ROWS = 0;
export function getNR(): number { return 0; }

const SINGLE_ROW_THRESHOLD = 7;

export function navbarRows(itemCount: number): number {
  return itemCount <= SINGLE_ROW_THRESHOLD ? 2 : 3;
}

export type NavItem = { key: string; label: string; };

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

function renderNavRow(items: NavItem[], cols: number): string {
  if (items.length === 0) return chalk.bgBlack(" ".repeat(cols));
  const colW = Math.floor(cols / items.length);
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const isLast   = i === items.length - 1;
    const width    = isLast ? cols - colW * (items.length - 1) : colW;
    const keyBlock = ` ${items[i].key} `;
    const labAvail = Math.max(1, width - keyBlock.length - 1);
    const label    = items[i].label.slice(0, labAvail);
    const pad      = Math.max(0, labAvail - label.length);
    out += chalk.bgBlack(chalk.bgWhite.black.bold(keyBlock) + chalk.white(` ${label}`) + " ".repeat(pad));
  }
  return out;
}

export function drawNavbar(items: NavItem[]): void {
  const cols   = C();
  const single = items.length <= SINGLE_ROW_THRESHOLD;
  let out = "";
  if (single) {
    out += at(1, 1) + clr() + renderNavRow(items, cols);
    out += at(2, 1) + clr() + chalk.dim("─".repeat(cols));
  } else {
    const half = Math.ceil(items.length / 2);
    out += at(1, 1) + clr() + renderNavRow(items.slice(0, half), cols);
    out += at(2, 1) + clr() + renderNavRow(items.slice(half), cols);
    out += at(3, 1) + clr() + chalk.dim("─".repeat(cols));
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