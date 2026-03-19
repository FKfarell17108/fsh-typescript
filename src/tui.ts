import chalk from "chalk";

export const w   = process.stdout.write.bind(process.stdout);
export const at  = (r: number, c: number) => `\x1b[${r};${c}H`;
export const clr = () => `\x1b[2K`;
export const C   = () => process.stdout.columns || 80;
export const R   = () => process.stdout.rows    || 24;

export const NAVBAR_ROWS  = 2;
export const FOOTER_ROWS  = 1;

export function visibleLen(str: string): number {
  return str.replace(/\x1b\[[0-9;]*[\x40-\x7e]/g, "").length;
}

export function padOrTrim(str: string, width: number): string {
  const vlen = visibleLen(str);
  if (vlen < width) return str + " ".repeat(width - vlen);
  if (vlen === width) return str;

  let out   = "";
  let count = 0;
  let i     = 0;
  while (i < str.length) {
    if (str[i] === "\x1b") {
      const end = str.indexOf("m", i);
      if (end !== -1) { out += str.slice(i, end + 1); i = end + 1; continue; }
    }
    if (count >= width - 1) { out += chalk.reset(""); break; }
    out += str[i];
    count++;
    i++;
  }
  return out + chalk.reset("");
}

export function drawNavbar(hints: string[], right?: string) {
  const cols      = C();
  const rightStr  = right ? " " + right + " " : "";
  const rightLen  = visibleLen(rightStr);
  const available = cols - 2 - rightLen;

  let chosen = hints[hints.length - 1];
  for (const h of hints) {
    if (visibleLen(h) <= available) { chosen = h; break; }
  }

  const leftPart  = padOrTrim(" " + chosen, cols - rightLen);
  const rightPart = rightLen > 0 ? chalk.bgBlack.dim(rightStr) : "";
  let out         = at(1, 1) + clr() + chalk.bgBlack.white(leftPart) + rightPart;
  out            += at(2, 1) + clr() + chalk.dim("─".repeat(cols));
  w(out);
}

export function drawFooter(
  footerRow: number,
  total: number,
  scrollTop: number,
  vis: number,
  statLeft?: string
) {
  const cols = C();
  const more = total - (scrollTop + vis);

  const leftStr  = statLeft ? "  " + statLeft : "";
  const leftLen  = visibleLen(leftStr);

  let rightStr = "";
  if (total > vis) {
    rightStr = more > 0 ? `  ↓ ${more} more  ` : "  (end)  ";
  }
  const rightLen = visibleLen(rightStr);

  const gap = Math.max(0, cols - leftLen - rightLen);

  let out = at(footerRow, 1) + clr();
  out += chalk.dim(leftStr);
  out += " ".repeat(gap);
  out += chalk.dim(rightStr);
  w(out);
}

export function kb(s: string): string {
  return chalk.bgGray.white.bold(` ${s} `);
}

export function enterAlt() {
  w("\x1b[?1049h\x1b[?25l");
}

export function exitAlt() {
  w("\x1b[?25h\x1b[?1049l");
}

export function clearScreen() {
  w("\x1b[2J");
}