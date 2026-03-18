import fs from "fs";
import path from "path";
import chalk from "chalk";

export const HISTORY_FILE = path.join(process.env.HOME ?? "~", ".fsh_history");
export const HISTORY_SIZE = 500;

export type HistoryEntry = {
  cmd: string;
  ts: number;
};

// ─── Read / Write ─────────────────────────────────────────────────────────────

export function loadHistoryEntries(): HistoryEntry[] {
  try {
    const lines = fs.readFileSync(HISTORY_FILE, "utf8").split("\n").filter(Boolean);
    const entries: HistoryEntry[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const sep = line.indexOf("|");
      let cmd: string, ts: number;
      if (sep === -1) { cmd = line; ts = 0; }
      else { ts = parseInt(line.slice(0, sep)); cmd = line.slice(sep + 1); }
      if (cmd && !seen.has(cmd)) { entries.push({ cmd, ts }); seen.add(cmd); }
    }

    return entries.reverse().slice(0, HISTORY_SIZE);
  } catch {
    return [];
  }
}

export function saveHistoryEntries(entries: HistoryEntry[]) {
  try {
    const seen = new Set<string>();
    const clean = entries.filter((e) => {
      if (!e.cmd || seen.has(e.cmd)) return false;
      seen.add(e.cmd); return true;
    });
    fs.writeFileSync(
      HISTORY_FILE,
      [...clean].reverse().map((e) => `${e.ts}|${e.cmd}`).join("\n") + "\n",
      "utf8"
    );
  } catch {}
}

export function entriesToStrings(entries: HistoryEntry[]): string[] {
  return entries.map((e) => e.cmd);
}

export function pushEntry(entries: HistoryEntry[], cmd: string): HistoryEntry[] {
  const filtered = entries.filter((e) => e.cmd !== cmd);
  return [{ cmd, ts: Date.now() }, ...filtered].slice(0, HISTORY_SIZE);
}

// ─── Time buckets ─────────────────────────────────────────────────────────────

type Bucket = { label: string; entries: HistoryEntry[] };

function groupByTime(entries: HistoryEntry[]): Bucket[] {
  const now = Date.now();
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets: Bucket[] = [
    { label: "Last hour",  entries: [] },
    { label: "Today",      entries: [] },
    { label: "Yesterday",  entries: [] },
    { label: "This week",  entries: [] },
    { label: "Older",      entries: [] },
  ];

  for (const e of entries) {
    const age = now - e.ts;
    if (e.ts === 0 || e.ts < startOfWeek.getTime())        buckets[4].entries.push(e);
    else if (e.ts < startOfYesterday.getTime())            buckets[3].entries.push(e);
    else if (e.ts < startOfToday.getTime())                buckets[2].entries.push(e);
    else if (age < 3_600_000)                              buckets[0].entries.push(e);
    else                                                   buckets[1].entries.push(e);
  }

  return buckets.filter((b) => b.entries.length > 0);
}

// ─── Interactive history manager ──────────────────────────────────────────────

export function showHistoryManager(
  entries: HistoryEntry[],
  onDone: (updated: HistoryEntry[]) => void
) {
  const stdin = process.stdin;

  if (entries.length === 0) {
    console.log(chalk.gray("  (no command history)"));
    return onDone(entries);
  }

  type Row =
    | { kind: "header"; bucketIdx: number }
    | { kind: "entry";  entry: HistoryEntry; bucketIdx: number };

  const buckets = groupByTime(entries);
  let rows: Row[] = buildRows(buckets);
  let cursor = 0;
  let lastRenderedLines = 0;

  function buildRows(bs: Bucket[]): Row[] {
    const r: Row[] = [];
    bs.forEach((b, bi) => {
      if (b.entries.length === 0) return;
      r.push({ kind: "header", bucketIdx: bi });
      b.entries.forEach((e) => r.push({ kind: "entry", entry: e, bucketIdx: bi }));
    });
    return r;
  }

  const COLS = process.stdout.columns || 80;

  function render() {
    const totalRows = rows.length;
    let frame = "";

    // Move up to overwrite previous render
    if (lastRenderedLines > 0) {
      frame += `\x1b[${lastRenderedLines}A\r\x1b[J`;
    }

    // Hint bar
    const k = (s: string) => chalk.bgGray.white.bold(` ${s} `);
    frame += "\n";
    frame +=
      " " + k("↑↓") + chalk.gray(" navigate  ") +
      k("d") + chalk.gray(" delete group  ") +
      k("D") + chalk.gray(" delete all  ") +
      k("q") + chalk.gray("/") + k("esc") + chalk.gray(" quit") +
      "\x1b[K\n\x1b[K\n";

    for (let i = 0; i < totalRows; i++) {
      const row = rows[i];
      const isActive = i === cursor;

      if (row.kind === "header") {
        const b = buckets[row.bucketIdx];
        const label = `  ${b.label}  (${b.entries.length} commands)`;
        frame += isActive
          ? chalk.bgYellow.black.bold(label.padEnd(COLS - 1)) + "\x1b[K\n"
          : chalk.yellow.bold(label) + "\x1b[K\n";
      } else {
        const { cmd, ts } = row.entry;
        const time = ts ? chalk.gray(new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : "";
        const maxCmd = COLS - 10;
        const display = cmd.length > maxCmd ? cmd.slice(0, maxCmd - 1) + "…" : cmd;
        const padded = ("    " + display).padEnd(COLS - 8);
        frame += isActive
          ? chalk.bgWhite.black.bold(padded) + "  " + time + "\x1b[K\n"
          : chalk.white(padded) + "  " + time + "\x1b[K\n";
      }
    }

    // hint(1) + blank(1) + rows
    lastRenderedLines = 2 + totalRows;
    process.stdout.write(frame);
  }

  function clearUI() {
    if (lastRenderedLines > 0) {
      process.stdout.write(`\x1b[${lastRenderedLines}A\r\x1b[J`);
      lastRenderedLines = 0;
    }
  }

  function cleanup() {
    stdin.removeAllListeners("data");
    if (stdin.isTTY) stdin.setRawMode(false);
    process.stdout.write("\x1b[?25h");
  }

  function exit() {
    clearUI();
    cleanup();
    const remaining = buckets.flatMap((b) => b.entries);
    setTimeout(() => onDone(remaining), 20);
  }

  function deleteBucketAtCursor() {
    if (rows.length === 0) return;
    const row = rows[cursor];
    buckets[row.bucketIdx].entries = [];
    rows = buildRows(buckets);
    if (rows.length === 0) return exit();
    cursor = Math.min(cursor, rows.length - 1);
    render();
  }

  let escBuf = "";
  let escTimer: ReturnType<typeof setTimeout> | null = null;

  function onKey(raw: string) {
    // Buffer escape sequences
    if (raw === "\u001b") {
      escBuf = raw;
      escTimer = setTimeout(() => {
        // Standalone esc — treat as quit
        escBuf = "";
        exit();
      }, 50);
      return;
    }

    if (escBuf) {
      escBuf += raw;
      if (escTimer) { clearTimeout(escTimer); escTimer = null; }

      // Wait for full sequence
      if (escBuf === "\u001b[") return;

      const seq = escBuf;
      escBuf = "";

      if (seq === "\u001b[A") { if (cursor > 0) { cursor--; render(); } }
      else if (seq === "\u001b[B") { if (cursor < rows.length - 1) { cursor++; render(); } }
      return;
    }

    if (raw === "\u0003" || raw === "q") return exit();
    if (raw === "D") {
      buckets.forEach((b) => { b.entries = []; });
      return exit();
    }
    if (raw === "d" || raw === "\x7f") return deleteBucketAtCursor();
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  process.stdout.write("\x1b[?25l");
  stdin.on("data", onKey);

  lastRenderedLines = 0;
  render();
}