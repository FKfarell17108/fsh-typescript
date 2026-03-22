import chalk from "chalk";
import { w, at, clr, C, R, visibleLen } from "./tui";

export type SortDir = "asc" | "desc";

export type LsSortKey   = "name" | "type" | "size" | "date" | "hidden";
export type TrashSortKey = "date" | "name" | "size" | "type";
export type LogSortKey   = "date" | "kind" | "status";

export type LsSort    = { key: LsSortKey;    dir: SortDir };
export type TrashSort = { key: TrashSortKey; dir: SortDir };
export type LogSort   = { key: LogSortKey;   dir: SortDir };

export const DEFAULT_LS_SORT:    LsSort    = { key: "type", dir: "asc" };
export const DEFAULT_TRASH_SORT: TrashSort = { key: "date", dir: "desc" };
export const DEFAULT_LOG_SORT:   LogSort   = { key: "date", dir: "desc" };

export function lsSortLabel(s: LsSort): string {
  const labels: Record<LsSortKey, string> = {
    name:   "Name",
    type:   "Type",
    size:   "Size",
    date:   "Date",
    hidden: "Hidden last",
  };
  if (s.key === "hidden") return "Hidden last";
  return labels[s.key] + (s.dir === "asc" ? " A>Z" : " Z>A");
}

export function trashSortLabel(s: TrashSort): string {
  const map: Record<TrashSortKey, [string, string]> = {
    date:  ["Date newest", "Date oldest"],
    name:  ["Name A>Z",    "Name Z>A"],
    size:  ["Size large",  "Size small"],
    type:  ["Type dir",    "Type file"],
  };
  return map[s.key][s.dir === "asc" ? 0 : 1];
}

export function logSortLabel(s: LogSort): string {
  const map: Record<LogSortKey, [string, string]> = {
    date:   ["Date newest", "Date oldest"],
    kind:   ["Kind A>Z",    "Kind Z>A"],
    status: ["Status done", "Status err"],
  };
  return map[s.key][s.dir === "asc" ? 0 : 1];
}

type LsEntry = { name: string; isDir: boolean };

export function sortLsEntries(entries: LsEntry[], sort: LsSort): LsEntry[] {
  const arr = [...entries];
  arr.sort((a, b) => {
    if (sort.key === "hidden") {
      const aH = a.name.startsWith(".") ? 1 : 0;
      const bH = b.name.startsWith(".") ? 1 : 0;
      if (aH !== bH) return aH - bH;
      return Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name);
    }
    if (sort.key === "type") {
      const cmp = Number(b.isDir) - Number(a.isDir);
      if (cmp !== 0) return sort.dir === "asc" ? cmp : -cmp;
      return a.name.localeCompare(b.name);
    }
    if (sort.key === "name") {
      const cmp = a.name.localeCompare(b.name);
      return sort.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return arr;
}

import fs from "fs";
import path from "path";

export function sortLsEntriesWithStat(entries: LsEntry[], sort: LsSort, dir: string): LsEntry[] {
  if (sort.key !== "size" && sort.key !== "date") return sortLsEntries(entries, sort);
  type WithStat = LsEntry & { stat?: fs.Stats };
  const withStat: WithStat[] = entries.map(e => {
    try { return { ...e, stat: fs.statSync(path.join(dir, e.name)) }; }
    catch { return { ...e }; }
  });
  withStat.sort((a, b) => {
    if (sort.key === "size") { const sa = a.stat?.size ?? 0; const sb = b.stat?.size ?? 0; return sort.dir === "asc" ? sa - sb : sb - sa; }
    if (sort.key === "date") { const da = a.stat?.mtimeMs ?? 0; const db = b.stat?.mtimeMs ?? 0; return sort.dir === "desc" ? db - da : da - db; }
    return 0;
  });
  return withStat.map(({ name, isDir }) => ({ name, isDir }));
}

type DirEntry = { name: string; hidden: boolean };

export function sortDirEntries(entries: DirEntry[], sort: LsSort): DirEntry[] {
  const arr = [...entries];
  arr.sort((a, b) => {
    if (sort.key === "hidden") return Number(a.hidden) - Number(b.hidden) || a.name.localeCompare(b.name);
    if (sort.key === "name" || sort.key === "type") { const cmp = a.name.localeCompare(b.name); return sort.dir === "asc" ? cmp : -cmp; }
    return 0;
  });
  return arr;
}

export function sortDirEntriesWithStat(entries: DirEntry[], sort: LsSort, cwd: string): DirEntry[] {
  if (sort.key !== "size" && sort.key !== "date") return sortDirEntries(entries, sort);
  type WithStat = DirEntry & { stat?: fs.Stats };
  const withStat: WithStat[] = entries.map(e => {
    try { return { ...e, stat: fs.statSync(path.join(cwd, e.name)) }; }
    catch { return { ...e }; }
  });
  withStat.sort((a, b) => {
    if (sort.key === "size") { const sa = a.stat?.size ?? 0; const sb = b.stat?.size ?? 0; return sort.dir === "asc" ? sa - sb : sb - sa; }
    if (sort.key === "date") { const da = a.stat?.mtimeMs ?? 0; const db = b.stat?.mtimeMs ?? 0; return sort.dir === "desc" ? db - da : da - db; }
    return 0;
  });
  return withStat.map(({ name, hidden }) => ({ name, hidden }));
}

type PickerOption = { label: string; key: string; dir: SortDir };

function buildLsOptions(): PickerOption[] {
  return [
    { label: "Name A>Z",   key: "name",   dir: "asc"  },
    { label: "Name Z>A",   key: "name",   dir: "desc" },
    { label: "Type",       key: "type",   dir: "asc"  },
    { label: "Size large", key: "size",   dir: "desc" },
    { label: "Size small", key: "size",   dir: "asc"  },
    { label: "Date newest",key: "date",   dir: "desc" },
    { label: "Date oldest",key: "date",   dir: "asc"  },
    { label: "Hidden last",key: "hidden", dir: "asc"  },
  ];
}

function buildTrashOptions(): PickerOption[] {
  return [
    { label: "Date newest",key: "date",  dir: "desc" },
    { label: "Date oldest",key: "date",  dir: "asc"  },
    { label: "Name A>Z",   key: "name",  dir: "asc"  },
    { label: "Name Z>A",   key: "name",  dir: "desc" },
    { label: "Size large", key: "size",  dir: "desc" },
    { label: "Size small", key: "size",  dir: "asc"  },
    { label: "Type dir",   key: "type",  dir: "asc"  },
    { label: "Type file",  key: "type",  dir: "desc" },
  ];
}

function buildLogOptions(): PickerOption[] {
  return [
    { label: "Date newest",key: "date",   dir: "desc" },
    { label: "Date oldest",key: "date",   dir: "asc"  },
    { label: "Kind A>Z",   key: "kind",   dir: "asc"  },
    { label: "Kind Z>A",   key: "kind",   dir: "desc" },
    { label: "Status done",key: "status", dir: "asc"  },
    { label: "Status err", key: "status", dir: "desc" },
  ];
}

function isActive(opt: PickerOption, current: { key: string; dir: SortDir }): boolean {
  return opt.key === current.key && opt.dir === current.dir;
}

const COLS_PER_ROW = 4;

function computeColW(opts: PickerOption[]): number {
  const maxLabel = Math.max(...opts.map(o => o.label.length));
  return maxLabel + 5;
}

export function showSortPicker<T extends { key: string; dir: SortDir }>(
  kind: "ls" | "dir" | "trash" | "log",
  current: T,
  anchorRow: number,
  onSelect: (result: T) => void,
  onCancel: () => void,
): void {
  const stdin = process.stdin;
  const opts =
    kind === "trash" ? buildTrashOptions() :
    kind === "log"   ? buildLogOptions()   :
    buildLsOptions();

  const initIdx = opts.findIndex(o => isActive(o, current));
  let selIdx = initIdx >= 0 ? initIdx : 0;

  const colW  = computeColW(opts);
  const rows  = Math.ceil(opts.length / COLS_PER_ROW);
  const boxInnerW = COLS_PER_ROW * colW;
  const boxH  = rows + 2;

  const headerText = " Sort by ";
  const topBorderLen = boxInnerW + 2;

  const startRow = Math.max(1, anchorRow - boxH);

  function buildTopBorder(): string {
    const remaining = topBorderLen - 2 - headerText.length;
    const leftDash  = 1;
    const rightDash = Math.max(0, remaining - leftDash);
    return chalk.dim("┌") + chalk.dim("─" + headerText + "─".repeat(rightDash)) + chalk.dim("┐");
  }

  function buildBottomBorder(): string {
    return chalk.dim("└") + chalk.dim("─".repeat(topBorderLen - 2)) + chalk.dim("┘");
  }

  function draw(): void {
    let out = "";

    out += at(startRow, 1) + "\x1b[2K\x1b[0m" + buildTopBorder();

    for (let r = 0; r < rows; r++) {
      let rowContent = "";
      for (let c = 0; c < COLS_PER_ROW; c++) {
        const i   = r * COLS_PER_ROW + c;
        if (i >= opts.length) {
          rowContent += " ".repeat(colW);
          continue;
        }
        const opt    = opts[i];
        const active = isActive(opt, current);
        const isSel  = i === selIdx;

        const bullet  = active ? "\u25CF" : "\u25CB";
        const rawCell = ` ${bullet} ${opt.label}`;
        const padding = Math.max(0, colW - rawCell.length);
        const padded  = rawCell.length < colW
          ? rawCell + " ".repeat(padding)
          : rawCell.slice(0, colW);

        if (isSel) {
          rowContent += chalk.bgWhite.black.bold(padded);
        } else if (active) {
          rowContent += chalk.cyan(` \u25CF `) + chalk.white(opt.label) + " ".repeat(padding);
        } else {
          rowContent += chalk.dim(` \u25CB `) + chalk.dim(opt.label) + " ".repeat(padding);
        }
      }

      out += at(startRow + 1 + r, 1) + "\x1b[2K\x1b[0m" + chalk.dim("│") + rowContent + chalk.dim("│");
    }

    out += at(startRow + boxH - 1, 1) + "\x1b[2K\x1b[0m" + buildBottomBorder();
    w(out);
  }

  function clearBox(): void {
    let out = "";
    for (let i = 0; i < boxH; i++) out += at(startRow + i, 1) + clr();
    w(out);
  }

  function onKey(k: string): void {
    if (k === "\u0003" || k === "\u001b") { stdin.removeListener("data", onKey); clearBox(); onCancel(); return; }
    if (k === "\r") {
      const opt = opts[selIdx];
      stdin.removeListener("data", onKey); clearBox();
      onSelect({ ...current, key: opt.key, dir: opt.dir } as unknown as T);
      return;
    }
    if (k === "\u001b[C") { selIdx = Math.min(opts.length - 1, selIdx + 1); draw(); return; }
    if (k === "\u001b[D") { selIdx = Math.max(0, selIdx - 1); draw(); return; }
    if (k === "\u001b[B") { selIdx = Math.min(opts.length - 1, selIdx + COLS_PER_ROW); draw(); return; }
    if (k === "\u001b[A") { selIdx = Math.max(0, selIdx - COLS_PER_ROW); draw(); return; }
  }

  stdin.on("data", onKey);
  draw();
}