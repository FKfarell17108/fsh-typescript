import fs from "fs";
import path from "path";
import chalk from "chalk";
import { execFileSync } from "child_process";

export type GitInfo = {
  branch: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  staged: boolean;
  untracked: boolean;
};

export type GitFileStatus = "modified" | "staged" | "untracked" | "added" | "deleted" | "renamed" | "conflict";

export type GitFileStatuses = Map<string, GitFileStatus>;

function findGitRoot(dir: string): string | null {
  let current = dir;
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readFile(p: string): string | null {
  try { return fs.readFileSync(p, "utf8").trim(); } catch { return null; }
}

export function getGitInfo(): GitInfo | null {
  const root = findGitRoot(process.cwd());
  if (!root) return null;

  const gitDir = path.join(root, ".git");

  let branch = "HEAD";
  const head = readFile(path.join(gitDir, "HEAD"));
  if (head) {
    if (head.startsWith("ref: refs/heads/")) {
      branch = head.slice("ref: refs/heads/".length);
    } else {
      branch = head.slice(0, 7);
    }
  }

  let dirty = false;
  let staged = false;
  let untracked = false;
  let ahead = 0;
  let behind = 0;

  try {
    const out: string = execFileSync(
      "git",
      ["status", "--porcelain=v2", "--branch"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );

    for (const line of out.split("\n")) {
      if (line.startsWith("# branch.ab ")) {
        const m = line.match(/\+(\d+) -(\d+)/);
        if (m) { ahead = parseInt(m[1]); behind = parseInt(m[2]); }
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const xy = line.slice(2, 4);
        if (xy[0] !== "." && xy[0] !== "?") staged = true;
        if (xy[1] !== "." && xy[1] !== "?") dirty = true;
      } else if (line.startsWith("? ")) {
        untracked = true;
      }
    }
  } catch {
    return null;
  }

  return { branch, dirty, staged, untracked, ahead, behind };
}

export type GitDirStatus =
  | { kind: "repo"; repoName: string; branch: string }
  | { kind: "none" };

export function getGitDirStatus(dir: string): GitDirStatus {
  const root = findGitRoot(dir);
  if (!root) return { kind: "none" };

  const repoName = path.basename(root);

  let branch = "HEAD";
  const head = readFile(path.join(root, ".git", "HEAD"));
  if (head) {
    if (head.startsWith("ref: refs/heads/")) {
      branch = head.slice("ref: refs/heads/".length);
    } else {
      branch = head.slice(0, 7);
    }
  }

  return { kind: "repo", repoName, branch };
}

export function getGitFileStatuses(dir: string): GitFileStatuses {
  const statuses: GitFileStatuses = new Map();
  const root = findGitRoot(dir);
  if (!root) return statuses;

  try {
    const out = execFileSync(
      "git",
      ["status", "--porcelain", "-u"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }
    );

    for (const line of out.split("\n")) {
      if (line.length < 4) continue;
      const x    = line[0];
      const y    = line[1];
      const file = line.slice(3).trim();

      const absPath = path.join(root, file.includes(" -> ") ? file.split(" -> ")[1] : file);
      const rel     = path.relative(dir, absPath);

      if (rel.startsWith("..")) continue;

      const topLevel = rel.split(path.sep)[0];

      let status: GitFileStatus;
      if (x === "?" && y === "?") {
        status = "untracked";
      } else if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
        status = "conflict";
      } else if (x === "R") {
        status = "renamed";
      } else if (x !== " " && x !== "." && y === " ") {
        status = "staged";
      } else if (x === "A" && y !== " ") {
        status = "added";
      } else if ((x === "D") || (y === "D")) {
        status = "deleted";
      } else if (y !== " " && y !== ".") {
        status = "modified";
      } else {
        status = "staged";
      }

      if (!statuses.has(topLevel)) {
        statuses.set(topLevel, status);
      } else {
        const existing = statuses.get(topLevel)!;
        if (status === "conflict") statuses.set(topLevel, "conflict");
        else if (status === "staged" && existing !== "conflict") statuses.set(topLevel, "staged");
      }
    }
  } catch {
    return statuses;
  }

  return statuses;
}

export function gitStatusColor(status: GitFileStatus): (s: string) => string {
  switch (status) {
    case "modified":  return chalk.hex("#FFD580");
    case "staged":    return chalk.hex("#AEDD87");
    case "added":     return chalk.hex("#AEDD87");
    case "untracked": return chalk.hex("#FF9E64");
    case "deleted":   return chalk.hex("#FF7B8A");
    case "renamed":   return chalk.hex("#70D4FF");
    case "conflict":  return chalk.hex("#FF5370");
  }
}

export function gitStatusBadge(status: GitFileStatus): string {
  switch (status) {
    case "modified":  return chalk.hex("#FFD580")("~");
    case "staged":    return chalk.hex("#AEDD87")("+");
    case "added":     return chalk.hex("#AEDD87")("+");
    case "untracked": return chalk.hex("#FF9E64")("?");
    case "deleted":   return chalk.hex("#FF7B8A")("-");
    case "renamed":   return chalk.hex("#70D4FF")("→");
    case "conflict":  return chalk.hex("#FF5370")("!");
  }
}

export function formatGitPrompt(info: GitInfo): string {
  let s = chalk.gray("(") + chalk.magenta(info.branch);

  const indicators: string[] = [];
  if (info.staged)    indicators.push(chalk.green("●"));
  if (info.dirty)     indicators.push(chalk.yellow("✚"));
  if (info.untracked) indicators.push(chalk.red("…"));

  if (indicators.length > 0) s += " " + indicators.join("");

  if (info.ahead > 0)  s += " " + chalk.cyan(`↑${info.ahead}`);
  if (info.behind > 0) s += " " + chalk.red(`↓${info.behind}`);

  s += chalk.gray(")");
  return s;
}