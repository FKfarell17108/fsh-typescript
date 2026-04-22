import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import { w, at, clr, C, R, drawNavbar, NavItem, NavRows, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";

export type GeneralEventKind = "command" | "copy" | "move" | "rename" | "trash" | "restore" | "delete" | "empty_trash";
export type GeneralEvent = { id: string; kind: GeneralEventKind; label: string; detail: string; ts: number; };
type Category = "commands" | "file_mutations" | "trash_ops";

const LOG_FILE = path.join(os.homedir(), ".fsh_general_history.json");
const MAX_EVENTS = 500; const PREVIEW_COUNT = 5;
let events: GeneralEvent[] = [];

function makeId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function persist(): void { try { fs.writeFileSync(LOG_FILE, JSON.stringify(events, null, 2), "utf8"); } catch {} }

export function loadGeneralHistory(): void { try { events = JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch { events = []; } }
export function logEvent(kind: GeneralEventKind, label: string, detail: string): void {
  if (kind === "command") events = events.filter(e => !(e.kind === "command" && e.label === label));
  events.unshift({ id: makeId(), kind, label, detail, ts: Date.now() });
  if (events.length > MAX_EVENTS) events = events.slice(0, MAX_EVENTS); persist();
}
export function deleteCommandEvents(cmd: string): void { events = events.filter(e => !(e.kind === "command" && e.label === cmd)); persist(); }
export function deleteAllCommandEvents(): void { events = events.filter(e => e.kind !== "command"); persist(); }
export function getGeneralEvents(): GeneralEvent[] { return events; }

function categoryOf(kind: GeneralEventKind): Category {
  if (kind === "command") return "commands";
  if (kind === "trash" || kind === "restore" || kind === "delete" || kind === "empty_trash") return "trash_ops";
  return "file_mutations";
}
const CATEGORY_LABEL: Record<Category, string> = { commands: "Commands", file_mutations: "File & Folder Mutations", trash_ops: "Trash Operations" };
const CATEGORY_COLOR: Record<Category, (s: string) => string> = { commands: chalk.green.bold, file_mutations: chalk.cyan.bold, trash_ops: chalk.yellow.bold };
const ENTRY_COLOR:    Record<Category, (s: string) => string> = { commands: chalk.green, file_mutations: chalk.cyan, trash_ops: chalk.yellow };
const CATEGORY_EMPTY: Record<Category, string> = { commands: "no commands yet", file_mutations: "no file operations yet", trash_ops: "no trash activity yet" };

function kindTag(kind: GeneralEventKind): string {
  switch (kind) {
    case "command":     return "";
    case "copy":        return chalk.cyan("copy   ");
    case "move":        return chalk.magenta("move   ");
    case "rename":      return chalk.blue("rename ");
    case "trash":       return chalk.yellow("trash  ");
    case "restore":     return chalk.green("restore");
    case "delete":      return chalk.red("delete ");
    case "empty_trash": return chalk.red("empty  ");
  }
}

function kindTagRaw(kind: GeneralEventKind): string {
  switch (kind) {
    case "command":     return "";
    case "copy":        return "copy   ";
    case "move":        return "move   ";
    case "rename":      return "rename ";
    case "trash":       return "trash  ";
    case "restore":     return "restore";
    case "delete":      return "delete ";
    case "empty_trash": return "empty  ";
  }
}

function fmtTime(ts: number): string { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

type Row =
  | { kind: "cat_header"; cat: Category; count: number; expanded: boolean }
  | { kind: "entry"; event: GeneralEvent; cat: Category }
  | { kind: "show_more"; cat: Category; remaining: number }
  | { kind: "cat_empty"; cat: Category };

function buildRows(evts: GeneralEvent[], expanded: Record<Category, boolean>): Row[] {
  const cats: Category[] = ["commands", "file_mutations", "trash_ops"];
  const buckets: Record<Category, GeneralEvent[]> = { commands: [], file_mutations: [], trash_ops: [] };
  for (const e of evts) buckets[categoryOf(e.kind)].push(e);
  const rows: Row[] = [];
  for (const cat of cats) {
    const items = buckets[cat];
    rows.push({ kind: "cat_header", cat, count: items.length, expanded: expanded[cat] });
    if (expanded[cat]) {
      if (!items.length) rows.push({ kind: "cat_empty", cat });
      else for (const item of items) rows.push({ kind: "entry", event: item, cat });
    } else {
      if (!items.length) rows.push({ kind: "cat_empty", cat });
      else {
        for (const item of items.slice(0, PREVIEW_COUNT)) rows.push({ kind: "entry", event: item, cat });
        const rem = items.length - PREVIEW_COUNT; if (rem > 0) rows.push({ kind: "show_more", cat, remaining: rem });
      }
    }
  }
  return rows;
}

function drawContentRows(rows: Row[], sel: number, scrollTop: number, vis: number, start: number, selected?: Set<string>): void {
  const cols = C(); let out = "";
  for (let i = 0; i < vis; i++) {
    out += at(start + i, 1) + clr();
    const row    = rows[scrollTop + i]; if (!row) continue;
    const active = (scrollTop + i) === sel;

    if (row.kind === "cat_header") {
      const colorFn  = CATEGORY_COLOR[row.cat];
      const arrow    = row.expanded ? "▾ " : "▸ ";
      const countStr = row.count > 0 ? `  (${row.count})` : "  (empty)";
      const raw      = arrow + CATEGORY_LABEL[row.cat] + countStr;
      if   (active) out += chalk.bgWhite.black.bold(padOrTrim(raw, cols));
      else          out += colorFn(raw);

    } else if (row.kind === "cat_empty") {
      const raw = `    ${CATEGORY_EMPTY[row.cat]}`;
      if   (active) out += chalk.bgWhite.black.bold(padOrTrim(raw, cols));
      else          out += chalk.dim(raw);

    } else if (row.kind === "show_more") {
      const colorFn = CATEGORY_COLOR[row.cat];
      const raw     = `    ↓ ${row.remaining} more — press enter to show`;
      if   (active) out += chalk.bgWhite.black.bold(padOrTrim(raw, cols));
      else          out += colorFn(raw);

    } else {
      const e       = row.event;
      const tagRaw  = kindTagRaw(e.kind);
      const timeStr = fmtTime(e.ts);
      const isSel   = selected?.has(e.id) ?? false;
      const timeLen = timeStr.length;
      const leftW   = cols - timeLen - 2;
      const maxLbl  = Math.max(8, leftW - 4 - tagRaw.length - 1);
      const lbl     = e.label.length > maxLbl ? e.label.slice(0, maxLbl - 1) + "…" : e.label;
      const rawLeft = "    " + tagRaw + lbl;

      if      (active && isSel) out += chalk.bgMagenta.white.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgMagenta.white.bold(timeStr);
      else if (active)          out += chalk.bgWhite.black.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgWhite.black.bold(timeStr);
      else if (isSel)           out += chalk.magenta.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.magenta.bold(timeStr);
      else {
        const colored = ENTRY_COLOR[row.cat]("    " + tagRaw + lbl);
        out += colored + " ".repeat(Math.max(1, leftW - visibleLen("    " + tagRaw + lbl))) + "  " + chalk.dim(timeStr);
      }
    }
  }
  w(out);
}

function drawDetailContent(e: GeneralEvent, start: number, v: number): void {
  let out = ""; let ln = 0;
  function line(s: string) { if (ln >= v) return; out += at(start + ln, 1) + clr() + s; ln++; }
  const cat    = categoryOf(e.kind);
  const catClr = CATEGORY_COLOR[cat];
  line(""); line("  " + catClr(CATEGORY_LABEL[cat]) + chalk.dim("  ·  ") + kindTag(e.kind).trimEnd() + "  " + chalk.dim(fmtTime(e.ts)));
  line("  " + chalk.dim("id: " + e.id)); line(""); line("  " + chalk.dim("what")); line("  " + chalk.white(e.label));
  if (e.detail) { line(""); line("  " + chalk.dim("detail")); for (const dl of e.detail.split("\n")) line("  " + chalk.white(dl)); }
  for (let i = ln; i < v; i++) out += at(start + i, 1) + clr(); w(out);
}

export function showGeneralHistory(onBack: () => void): void {
  loadGeneralHistory();
  const { loadHistoryEntries } = require("./historyManager");
  const liveEntries: { cmd: string }[] = loadHistoryEntries();
  const liveCmds = new Set(liveEntries.map((e: { cmd: string }) => e.cmd));
  events = events.filter(e => e.kind !== "command" || liveCmds.has(e.label)); persist();

  const stdin = process.stdin;
  const expanded: Record<Category, boolean> = { commands: false, file_mutations: false, trash_ops: false };
  let rows = buildRows(events, expanded); let sel = 0; let scrollTop = 0;

  function NAV(): NavRows {
    return [[
      { key: "Nav", label: "Navigate"                                              },
      { key: "Ent", label: !rows.length ? "Expand" : rows[sel]?.kind === "entry" ? "Detail" : "Expand" },
      { key: "Esc", label: "Back"                                                  },
    ]];
  }

  const NR = 2;
  function vis(): number { return Math.max(1, R() - NR - 2); }
  function start(): number { return NR + 2; }
  function adjustScroll(): void { const v = vis(); if (sel < scrollTop) scrollTop = sel; if (sel >= scrollTop + v) scrollTop = sel - v + 1; }
  function rebuild(): void { rows = buildRows(events, expanded); sel = Math.min(sel, Math.max(0, rows.length - 1)); adjustScroll(); }
  function buildLeft(): string { return events.length ? `Activity  ${events.length} event${events.length === 1 ? "" : "s"}` : "Activity  (no events yet)"; }
  function buildRight(): string { if (rows.length <= vis()) return ""; const more = rows.length - (scrollTop + vis()); return more > 0 ? `↓ ${more} more` : "end"; }
  function fullDraw(): void { drawNavbar(NAV()); drawContentRows(rows, sel, scrollTop, vis(), start()); drawBottomBar(buildLeft(), buildRight()); }
  function onResize(): void { clearScreen(); adjustScroll(); fullDraw(); }
  function cleanup(): void { process.stdout.removeListener("resize", onResize); stdin.removeAllListeners("data"); clearScreen(); exitAlt(); }
  function exit(): void { cleanup(); setTimeout(onBack, 20); }

  const CAT_TITLE: Record<Category, string> = {
    commands:       "Commands",
    file_mutations: "File & Folder Mutations",
    trash_ops:      "Trash Operations",
  };

  const CAT_EMPTY_MSG: Record<Category, string> = {
    commands:       "no commands yet",
    file_mutations: "no file operations yet",
    trash_ops:      "no trash activity yet",
  };

  const CAT_COLOR: Record<Category, (s: string) => string> = {
    commands:       chalk.green,
    file_mutations: chalk.cyan,
    trash_ops:      chalk.yellow,
  };

  function kindOfCat(cat: Category): GeneralEventKind[] {
    if (cat === "commands")       return ["command"];
    if (cat === "file_mutations") return ["copy", "move", "rename"];
    return ["trash", "restore", "delete", "empty_trash"];
  }

  function openCategoryEdit(cat: Category): void {
    const catKinds  = kindOfCat(cat);
    const catEvents = events.filter(e => catKinds.includes(e.kind));
    const title     = CAT_TITLE[cat];
    const colorFn   = CAT_COLOR[cat];
    const isCmd     = cat === "commands";

    let eSel = 0; let eScroll = 0; let eSelected = new Set<string>();
    const editEvents = [...catEvents];

    function EDIT_NAV(): NavRows {
      return [[
        { key: "Nav", label: "Navigate"   },
        { key: "Spc", label: "Select"     },
        { key: "A",   label: "Select All" },
        ...(isCmd ? [{ key: "Ent", label: "Use" }] : [{ key: "Ent", label: "Detail" }]),
        { key: "X",   label: "Delete"     },
        { key: "D",   label: "Delete All" },
        { key: "Esc", label: eSelected.size > 0 ? "Deselect" : "Back" },
      ]];
    }

    const eNR = 2;
    function eVis(): number { return Math.max(1, R() - eNR - 2); }
    function eStart(): number { return eNR + 2; }
    function eAdjust(): void { const v = eVis(); if (eSel < eScroll) eScroll = eSel; if (eSel >= eScroll + v) eScroll = eSel - v + 1; }
    function eBuildLeft(): string {
      let s = `${title}  ${editEvents.length}`;
      if (eSelected.size) s += chalk.magenta(`  ${eSelected.size} sel`);
      return s;
    }
    function eBuildRight(): string {
      if (editEvents.length <= eVis()) return "";
      const more = editEvents.length - (eScroll + eVis());
      return more > 0 ? `↓ ${more} more` : "end";
    }

    function drawEdit(): void {
      const v = eVis(); const s = eStart(); const cols = C();
      drawNavbar(EDIT_NAV());
      let out = "";
      if (!editEvents.length) {
        out += at(s, 1) + clr() + chalk.dim(`  (${CAT_EMPTY_MSG[cat]})`);
        for (let i = 1; i < v; i++) out += at(s + i, 1) + clr();
        w(out); drawBottomBar(eBuildLeft(), ""); return;
      }
      for (let i = 0; i < v; i++) {
        out += at(s + i, 1) + clr();
        const e      = editEvents[eScroll + i]; if (!e) continue;
        const active = (eScroll + i) === eSel;
        const isSel  = eSelected.has(e.id);
        const ts     = fmtTime(e.ts);
        const tsLen  = ts.length;
        const leftW  = cols - tsLen - 2;
        const tagR   = isCmd ? "" : kindTagRaw(e.kind) + " ";
        const maxLbl = leftW - 4 - tagR.length;
        const lbl    = e.label.length > maxLbl ? e.label.slice(0, maxLbl - 1) + "…" : e.label;
        const rawLeft = "    " + tagR + lbl;

        if      (active && isSel) out += chalk.bgMagenta.white.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgMagenta.white.bold(ts);
        else if (active)          out += chalk.bgWhite.black.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.bgWhite.black.bold(ts);
        else if (isSel)           out += chalk.magenta.bold(padOrTrim(rawLeft, leftW) + "  ") + chalk.magenta.bold(ts);
        else {
          const coloredLeft = isCmd
            ? colorFn("    " + lbl)
            : "    " + kindTag(e.kind) + " " + colorFn(lbl);
          out += coloredLeft + " ".repeat(Math.max(1, leftW - rawLeft.length)) + "  " + chalk.dim(ts);
        }
      }
      w(out); drawBottomBar(eBuildLeft(), eBuildRight());
    }

    function toggleSel(): void { const id = editEvents[eSel]?.id; if (!id) return; if (eSelected.has(id)) eSelected.delete(id); else eSelected.add(id); drawEdit(); }
    function selectAll(): void { if (eSelected.size === editEvents.length) eSelected.clear(); else eSelected = new Set(editEvents.map(e => e.id)); drawEdit(); }

    function deleteSelected(): void {
      const toDelete = eSelected.size > 0 ? Array.from(eSelected) : (editEvents[eSel] ? [editEvents[eSel].id] : []);
      if (!toDelete.length) return;
      events = events.filter(e => !toDelete.includes(e.id)); persist(); eSelected.clear();
      const remaining = events.filter(e => catKinds.includes(e.kind));
      if (!remaining.length) { backFromEdit(); return; }
      editEvents.splice(0, editEvents.length, ...remaining);
      eSel = Math.min(eSel, editEvents.length - 1); eAdjust(); drawEdit();
    }

    function deleteAll(): void {
      events = events.filter(e => !catKinds.includes(e.kind)); persist(); backFromEdit();
    }

    function backFromEdit(): void {
      process.stdout.removeListener("resize", onEditResize); stdin.removeListener("data", onEditKey);
      process.stdout.on("resize", onResize); rebuild(); clearScreen(); fullDraw(); stdin.on("data", onKey);
    }

    const onEditResize = () => { clearScreen(); drawEdit(); };
    process.stdout.removeListener("resize", onResize); process.stdout.on("resize", onEditResize); stdin.removeListener("data", onKey);

    function onEditKey(raw: string): void {
      if (raw === "\u001b[A") { if (eSel > 0) { eSel--; eAdjust(); drawEdit(); } return; }
      if (raw === "\u001b[B") { if (eSel < editEvents.length - 1) { eSel++; eAdjust(); drawEdit(); } return; }
      if (raw === "\u001b" || raw === "\u0003") { if (eSelected.size > 0) { eSelected.clear(); drawEdit(); } else backFromEdit(); return; }
      if (raw.startsWith("\u001b")) return;
      if (raw === " ")                  { toggleSel(); return; }
      if (raw === "a")                  { selectAll(); return; }
      if (raw === "\r" && isCmd)        { backFromEdit(); return; }
      if (raw === "\r" && !isCmd)       { if (editEvents[eSel]) showDetailFromEdit(editEvents[eSel]); return; }
      if (raw === "x" || raw === "\x7f"){ deleteSelected(); return; }
      if (raw === "d")                  { deleteAll(); return; }
    }

    function showDetailFromEdit(e: GeneralEvent): void {
      const detailNAV: NavItem[] = [{ key: "Esc", label: "Back" }];
      const dNR = 2; const dStart = dNR + 2; const dVis = () => R() - dNR - 2;
      process.stdout.removeListener("resize", onEditResize);
      const onDR = () => { clearScreen(); drawNavbar([detailNAV]); drawDetailContent(e, dStart, dVis()); drawBottomBar(e.label.slice(0, 40), ""); };
      process.stdout.on("resize", onDR);
      function onDetailKey(k: string): void {
        if (k === "\u0003") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); cleanup(); setTimeout(onBack, 20); return; }
        if (k === "\u001b" || k === "q") {
          stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR);
          process.stdout.on("resize", onEditResize); clearScreen(); drawEdit(); stdin.on("data", onEditKey);
        }
      }
      stdin.removeListener("data", onEditKey); stdin.on("data", onDetailKey);
      clearScreen(); drawNavbar([detailNAV]); drawDetailContent(e, dStart, dVis()); drawBottomBar(e.label.slice(0, 40), "");
    }

    stdin.on("data", onEditKey); clearScreen(); drawEdit();
  }

  function handleEnter(): void {
    if (!rows.length) return;
    const row = rows[sel];
    if (row.kind === "cat_header") {
      openCategoryEdit(row.cat); return;
    }
    if (row.kind === "cat_empty") return;
    if (row.kind === "show_more") { expanded[row.cat] = true; rebuild(); fullDraw(); return; }
    if (row.kind === "entry") showDetail(row.event);
  }

  function showDetail(e: GeneralEvent): void {
    const detailNAV: NavItem[] = [{ key: "Esc", label: "Back" }];
    const dNR = 2; const dStart = dNR + 2; const dVis = () => R() - dNR - 2;
    process.stdout.removeListener("resize", onResize);
    const onDR = () => { clearScreen(); drawNavbar([detailNAV]); drawDetailContent(e, dStart, dVis()); drawBottomBar(e.label.slice(0, 40), ""); };
    process.stdout.on("resize", onDR);
    function onDetailKey(k: string): void {
      if (k === "\u0003") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); cleanup(); setTimeout(onBack, 20); return; }
      if (k === "\u001b" || k === "q") { stdin.removeListener("data", onDetailKey); process.stdout.removeListener("resize", onDR); process.stdout.on("resize", onResize); clearScreen(); fullDraw(); stdin.on("data", onKey); }
    }
    stdin.removeListener("data", onKey); stdin.on("data", onDetailKey);
    clearScreen(); drawNavbar([detailNAV]); drawDetailContent(e, dStart, dVis()); drawBottomBar(e.label.slice(0, 40), "");
  }

  function onKey(raw: string): void {
    if (raw === "\u001b[A") { if (sel > 0) { sel--; adjustScroll(); fullDraw(); } return; }
    if (raw === "\u001b[B") { if (sel < rows.length - 1) { sel++; adjustScroll(); fullDraw(); } return; }
    if (raw === "\u0003" || raw === "\u001b" || raw === "q") { exit(); return; }
    if (raw.startsWith("\u001b")) return;
    if (raw === "\r") { handleEnter(); return; }
  }

  process.stdout.on("resize", onResize);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume(); stdin.setEncoding("utf8"); stdin.on("data", onKey);
  enterAlt(); clearScreen(); fullDraw();
}