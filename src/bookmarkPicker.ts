import chalk from "chalk";
import { w, at, clr, C, R, drawNavbar, NavItem, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";
import { loadBookmarks, getBookmarks, removeBookmarkById, Bookmark, homify } from "./bookmarks";

export function showBookmarkPicker(
  currentDir: string,
  onCd: (dir: string) => void,
  onCancel: () => void,
): void {
  loadBookmarks();
  const stdin = process.stdin;
  let bms    = getBookmarks();
  let sel    = 0;
  let scroll = 0;

  const NAV = (): NavItem[] => [
    { key: "Nav",   label: "Navigate"                          },
    { key: "Ent",   label: "Go to folder"                      },
    { key: "X",     label: "Remove bookmark"                   },
    { key: "Esc",   label: "Cancel"                            },
  ];

  const NR = 2;
  function vis(): number { return Math.max(1, R() - NR - 2); }
  function adjustScroll(): void {
    const v = vis();
    if (sel < scroll)      scroll = sel;
    if (sel >= scroll + v) scroll = sel - v + 1;
  }

  function buildLeft(): string {
    if (!bms.length) return "Bookmarks  (empty)";
    return `Bookmarks  ${bms.length} folder${bms.length === 1 ? "" : "s"}`;
  }

  function buildRight(): string {
    if (bms.length <= vis()) return "";
    const more = bms.length - (scroll + vis());
    return more > 0 ? `↓ ${more} more` : "end";
  }

  function parentOf(p: string): string {
    const h = homify(p);
    const parent = homify(require("path").dirname(p));
    return parent === h ? "" : parent;
  }

  function drawContent(): void {
    const start = NR + 2; const cols = C(); const v = vis();
    let out = "";
    if (!bms.length) {
      out += at(start, 1) + clr() + chalk.dim("  (no bookmarks yet — press B on a directory in ls/dir to bookmark it)");
      for (let i = 1; i < v; i++) out += at(start + i, 1) + clr();
      w(out); return;
    }
    for (let i = 0; i < v; i++) {
      out += at(start + i, 1) + clr();
      const bm       = bms[scroll + i]; if (!bm) continue;
      const isActive = (scroll + i) === sel;
      const nameStr  = bm.name + "/";
      const subStr   = homify(bm.fullPath);
      const subLen   = visibleLen(subStr);
      const leftW    = cols - subLen - 3;
      const maxName  = Math.max(4, leftW - 3);
      const truncName = nameStr.length > maxName ? nameStr.slice(0, maxName - 1) + "…" : nameStr;
      const rawLeft  = "  " + truncName;

      if (isActive) {
        out += chalk.bgWhite.black.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgWhite.dim(subStr.slice(0, subLen));
      } else {
        out += chalk.hex("#FFD580").bold(rawLeft.padEnd(leftW)) + "  " + chalk.dim(subStr);
      }
    }
    w(out);
  }

  function fullDraw(): void { drawNavbar([NAV()]); drawContent(); drawBottomBar(buildLeft(), buildRight()); }
  function onResize(): void { clearScreen(); adjustScroll(); fullDraw(); }
  function cleanup(): void { process.stdout.removeListener("resize", onResize); stdin.removeAllListeners("data"); clearScreen(); exitAlt(); }
  function exit(): void { cleanup(); setTimeout(onCancel, 20); }

  function doRemove(): void {
    if (!bms.length) return;
    const bm = bms[sel];
    removeBookmarkById(bm.id);
    bms = getBookmarks();
    if (!bms.length) { fullDraw(); return; }
    sel = Math.min(sel, bms.length - 1);
    adjustScroll(); fullDraw();
  }

  function doSelect(): void {
    if (!bms.length) return;
    const bm = bms[sel];
    cleanup();
    setTimeout(() => onCd(bm.fullPath), 20);
  }

  function onKey(k: string): void {
    if (k === "\u001b[A") { if (sel > 0) { sel--; adjustScroll(); fullDraw(); } return; }
    if (k === "\u001b[B") { if (sel < bms.length - 1) { sel++; adjustScroll(); fullDraw(); } return; }
    if (k === "\u0003" || k === "\u001b") { exit(); return; }
    if (k.startsWith("\u001b")) return;
    if (k === "\r")            { doSelect(); return; }
    if (k === "x" || k === "X") { doRemove(); return; }
  }

  process.stdout.on("resize", onResize);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  enterAlt(); clearScreen(); fullDraw();
}