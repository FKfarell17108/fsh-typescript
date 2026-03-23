import chalk from "chalk";
import fs from "fs";
import path from "path";
import { getAllAliases } from "./aliases";

const BUILTINS = new Set([
  "exit", "echo", "type", "pwd", "cd", "ls", "dir", "alias", "unalias",
  "clear", "history", "trash", "fshrc", "neofetch",
  "bookmarks", "search", "helps",
]);

const CMD_EDITORS = new Set([
  "vim", "vi", "nvim", "nano", "emacs", "micro", "hx", "helix",
  "code", "gedit", "kate", "subl", "atom",
]);

const CMD_GIT = new Set([
  "git", "gh", "hub",
]);

const CMD_NODE = new Set([
  "node", "npm", "npx", "yarn", "pnpm", "bun", "deno", "ts-node",
]);

const CMD_PYTHON = new Set([
  "python", "python3", "python2", "pip", "pip3", "pipenv", "poetry", "uv",
]);

const CMD_SYSTEM = new Set([
  "sudo", "su", "systemctl", "service", "journalctl",
  "apt", "apt-get", "dpkg", "snap",
  "pacman", "yay", "brew",
  "kill", "killall", "pkill", "top", "htop", "btop",
  "ps", "pgrep", "lsof", "df", "du", "free", "uname",
]);

const CMD_NETWORK = new Set([
  "curl", "wget", "ssh", "scp", "sftp", "rsync",
  "ping", "traceroute", "netstat", "ss", "ip", "ifconfig",
  "nmap", "dig", "nslookup", "host",
]);

const CMD_FILE_OPS = new Set([
  "mkdir", "rmdir", "rm", "cp", "mv", "touch", "ln",
  "chmod", "chown", "chgrp", "find", "locate",
  "tar", "zip", "unzip", "gzip", "gunzip", "7z",
  "cat", "less", "more", "head", "tail", "tee",
  "grep", "awk", "sed", "sort", "uniq", "wc", "cut",
  "diff", "patch", "xargs",
]);

const CMD_DOCKER = new Set([
  "docker", "docker-compose", "podman", "kubectl", "helm", "k3s",
]);

const CMD_BUILD = new Set([
  "make", "cmake", "gcc", "g++", "clang", "rustc", "cargo",
  "go", "javac", "java", "mvn", "gradle",
  "tsc", "webpack", "vite", "rollup", "esbuild",
]);

const CMD_SHELL = new Set([
  "bash", "zsh", "fish", "sh", "dash",
  "source", "export", "env", "printenv", "set", "unset",
  "which", "whereis", "man", "tldr", "info",
  "date", "time", "watch", "sleep",
]);

const GIT_SUBCOMMANDS = new Set([
  "add", "commit", "push", "pull", "fetch", "merge", "rebase",
  "checkout", "switch", "branch", "status", "log", "diff",
  "stash", "tag", "remote", "clone", "init", "reset", "restore",
  "cherry-pick", "bisect", "blame", "show", "reflog",
]);

const NPM_SUBCOMMANDS = new Set([
  "install", "uninstall", "update", "run", "start", "build",
  "test", "publish", "init", "ci", "audit", "outdated",
  "link", "pack", "version", "exec", "create",
]);

const DOCKER_SUBCOMMANDS = new Set([
  "run", "build", "pull", "push", "ps", "images", "exec",
  "stop", "start", "restart", "rm", "rmi", "logs", "inspect",
  "compose", "network", "volume", "system", "container",
]);

const SUDO_LIKE = new Set(["sudo", "su", "doas", "run0"]);

const LONG_FLAGS_WITH_VALUES = new Set([
  "--output", "--file", "--config", "--format", "--target",
  "--host", "--port", "--user", "--password", "--key",
  "--message", "--branch", "--tag", "--name", "--type",
]);

function cmdColor(cmd: string): string {
  const base = cmd.split("/").pop() ?? cmd;
  if (BUILTINS.has(base)) return chalk.hex("#73D997")(cmd);
  if (getAllAliases().has(base)) return chalk.hex("#A8E6A3")(cmd);
  if (CMD_EDITORS.has(base)) return chalk.hex("#D4A9F5")(cmd);
  if (CMD_GIT.has(base)) return chalk.hex("#FFA878")(cmd);
  if (CMD_NODE.has(base)) return chalk.hex("#6EC6BF")(cmd);
  if (CMD_PYTHON.has(base)) return chalk.hex("#FFD580")(cmd);
  if (CMD_SYSTEM.has(base)) return chalk.hex("#FF7B8A")(cmd);
  if (CMD_NETWORK.has(base)) return chalk.hex("#70D4FF")(cmd);
  if (CMD_FILE_OPS.has(base)) return chalk.hex("#AEDD87")(cmd);
  if (CMD_DOCKER.has(base)) return chalk.hex("#5BC8F5")(cmd);
  if (CMD_BUILD.has(base)) return chalk.hex("#F5C542")(cmd);
  if (CMD_SHELL.has(base)) return chalk.hex("#B0B8D8")(cmd);
  return chalk.hex("#73D997")(cmd);
}

function subcommandColor(parent: string, sub: string): string {
  const base = parent.split("/").pop() ?? parent;
  if (CMD_GIT.has(base)) {
    if (GIT_SUBCOMMANDS.has(sub)) {
      const destructive = new Set(["reset", "rm", "clean", "rebase", "force"]);
      if (destructive.has(sub)) return chalk.hex("#FF7B8A")(sub);
      const creative = new Set(["init", "clone", "add", "commit", "push", "tag"]);
      if (creative.has(sub)) return chalk.hex("#AEDD87")(sub);
      return chalk.hex("#FFD580")(sub);
    }
  }
  if (CMD_NODE.has(base) || base === "npx") {
    if (NPM_SUBCOMMANDS.has(sub)) {
      if (sub === "install" || sub === "ci") return chalk.hex("#6EC6BF")(sub);
      if (sub === "uninstall" || sub === "rm") return chalk.hex("#FF7B8A")(sub);
      if (sub === "run" || sub === "start") return chalk.hex("#AEDD87")(sub);
      return chalk.hex("#FFD580")(sub);
    }
  }
  if (CMD_DOCKER.has(base)) {
    if (DOCKER_SUBCOMMANDS.has(sub)) {
      if (sub === "rm" || sub === "rmi" || sub === "stop") return chalk.hex("#FF7B8A")(sub);
      if (sub === "run" || sub === "build" || sub === "start") return chalk.hex("#AEDD87")(sub);
      return chalk.hex("#5BC8F5")(sub);
    }
  }
  if (SUDO_LIKE.has(base)) {
    return chalk.hex("#FF7B8A")(sub);
  }
  return chalk.hex("#FFD580")(sub);
}

function flagColor(flag: string): string {
  if (flag.startsWith("--")) {
    if (
      flag.includes("force") || flag.includes("hard") ||
      flag.includes("delete") || flag.includes("remove") ||
      flag.includes("purge") || flag.includes("nuke")
    ) return chalk.hex("#FF7B8A")(flag);
    if (
      flag.includes("help") || flag.includes("version") ||
      flag.includes("verbose") || flag.includes("dry-run")
    ) return chalk.hex("#70D4FF")(flag);
    if (
      flag.includes("output") || flag.includes("format") ||
      flag.includes("config") || flag.includes("file")
    ) return chalk.hex("#FFB347")(flag);
    return chalk.hex("#C9A0F0")(flag);
  }
  if (flag.startsWith("-")) {
    if (flag.includes("f") || (flag.includes("r") && flag.length === 3))
      return chalk.hex("#FF7B8A")(flag);
    if (flag.includes("v") || flag.includes("h"))
      return chalk.hex("#70D4FF")(flag);
    return chalk.hex("#FFD580")(flag);
  }
  return chalk.hex("#FFD580")(flag);
}

function numberArgColor(val: string): string {
  return chalk.hex("#FF9E64")(val);
}

type FsKind = "dir" | "dir_hidden" | "file" | "file_hidden" | "none";

function pathArgColor(full: string, kind: FsKind, hidden: boolean): string {
  switch (kind) {
    case "dir": return chalk.hex("#6BBFFF")(full);
    case "dir_hidden": return chalk.hex("#4A90B8")(full);
    case "file": return hidden ? chalk.hex("#888FA8")(full) : chalk.hex("#D8DEF0")(full);
    case "file_hidden": return chalk.hex("#666D88")(full);
    case "none": return chalk.hex("#FF7B8A").dim(full);
  }
}

let execCache = new Set<string>();
let execCacheTime = 0;
let refreshPending = false;
const CACHE_TTL = 5_000;

function refreshExecutables(): void {
  refreshPending = false;
  const set = new Set<string>();
  for (const dir of (process.env.PATH ?? "").split(":")) {
    try { for (const entry of fs.readdirSync(dir)) set.add(entry); }
    catch { }
  }
  execCache = set;
  execCacheTime = Date.now();
}

refreshExecutables();

function getExecutables(): Set<string> {
  if (!refreshPending && Date.now() - execCacheTime > CACHE_TTL) {
    refreshPending = true;
    setImmediate(refreshExecutables);
  }
  return execCache;
}

function commandExists(cmd: string): boolean {
  if (!cmd) return false;
  const base = cmd.split("/").pop() ?? cmd;
  if (BUILTINS.has(base)) return true;
  if (getAllAliases().has(base)) return true;
  if (cmd.startsWith("/") || cmd.startsWith("./") || cmd.startsWith("../")) {
    try { fs.accessSync(cmd, fs.constants.X_OK); return true; } catch { return false; }
  }
  return getExecutables().has(base);
}

function resolveFsKind(word: string): FsKind {
  let resolved = word;
  const home = process.env.HOME ?? "";
  if (word.startsWith("~/")) {
    resolved = path.join(home, word.slice(2));
  } else if (!word.startsWith("/")) {
    resolved = path.join(process.cwd(), word);
  }
  try {
    const stat = fs.statSync(resolved);
    const base = path.basename(resolved);
    const hidden = base.startsWith(".");
    if (stat.isDirectory()) return hidden ? "dir_hidden" : "dir";
    return hidden ? "file_hidden" : "file";
  } catch {
    return "none";
  }
}

function isNumeric(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s);
}

function colorArg(word: string, prevFlag: string): string {
  if (isNumeric(word)) return numberArgColor(word);

  if (prevFlag && LONG_FLAGS_WITH_VALUES.has(prevFlag)) {
    return chalk.hex("#FFB347")(word);
  }

  const looksLikePath =
    word.includes("/") || word.startsWith("~/") ||
    word.startsWith("./") || word.startsWith("../");

  if (looksLikePath || !word.includes(" ")) {
    const kind = resolveFsKind(word);
    const base = path.basename(word);
    const hidden = base.startsWith(".");
    if (kind !== "none" || looksLikePath) {
      return pathArgColor(word, kind, hidden);
    }
  }

  return chalk.hex("#C8CEE8")(word);
}

type TokenType =
  | "command"
  | "subcommand"
  | "arg"
  | "flag"
  | "operator"
  | "redirect"
  | "string_d"
  | "string_s"
  | "variable"
  | "incomplete_s"
  | "number";

type Token = { type: TokenType; value: string };

function tokenizeForHighlight(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let expectCmd = true;
  let lastCmd = "";

  while (i < input.length) {
    const ch = input[i];

    if (ch === " " || ch === "\t") {
      tokens.push({ type: "arg", value: ch });
      i++;
      continue;
    }

    if (ch === "&" && input[i + 1] === "&") { tokens.push({ type: "operator", value: "&&" }); i += 2; expectCmd = true; lastCmd = ""; continue; }
    if (ch === "|" && input[i + 1] === "|") { tokens.push({ type: "operator", value: "||" }); i += 2; expectCmd = true; lastCmd = ""; continue; }
    if (ch === "|") { tokens.push({ type: "operator", value: "|" }); i++; expectCmd = true; lastCmd = ""; continue; }
    if (ch === ";") { tokens.push({ type: "operator", value: ";" }); i++; expectCmd = true; lastCmd = ""; continue; }
    if (ch === "&") { tokens.push({ type: "operator", value: "&" }); i++; continue; }

    if (ch === ">" && input[i + 1] === ">") { tokens.push({ type: "redirect", value: ">>" }); i += 2; continue; }
    if (ch === ">") { tokens.push({ type: "redirect", value: ">" }); i++; continue; }
    if (ch === "<") { tokens.push({ type: "redirect", value: "<" }); i++; continue; }

    if (ch === '"') {
      let s = '"'; i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length) { s += input[i] + input[i + 1]; i += 2; }
        else { s += input[i++]; }
      }
      if (i < input.length) { s += '"'; i++; tokens.push({ type: "string_d", value: s }); }
      else { tokens.push({ type: "incomplete_s", value: s }); }
      continue;
    }

    if (ch === "'") {
      let s = "'"; i++;
      while (i < input.length && input[i] !== "'") { s += input[i++]; }
      if (i < input.length) { s += "'"; i++; tokens.push({ type: "string_s", value: s }); }
      else { tokens.push({ type: "incomplete_s", value: s }); }
      continue;
    }

    if (ch === "$") {
      let s = "$"; i++;
      while (i < input.length && /[A-Za-z0-9_?]/.test(input[i])) { s += input[i++]; }
      tokens.push({ type: "variable", value: s });
      continue;
    }

    let word = "";
    while (
      i < input.length &&
      input[i] !== " " && input[i] !== "\t" &&
      input[i] !== "|" && input[i] !== ">" && input[i] !== "<" &&
      input[i] !== ";" && input[i] !== "&" &&
      input[i] !== '"' && input[i] !== "'"
    ) { word += input[i++]; }

    if (!word) { i++; continue; }

    if (expectCmd) {
      tokens.push({ type: "command", value: word });
      lastCmd = word;
      expectCmd = false;
    } else if (
      word.startsWith("-") ||
      (tokens.length > 0 && tokens[tokens.length - 1]?.type === "arg" &&
        tokens[tokens.length - 1]?.value.trim() === "" && word.startsWith("-"))
    ) {
      tokens.push({ type: "flag", value: word });
    } else {
      const isFirstArg = tokens.filter(t => t.type !== "arg" || t.value.trim() !== "").length === 1;
      if (isFirstArg && lastCmd && !word.startsWith("-") && !word.includes("/")) {
        const base = lastCmd.split("/").pop() ?? lastCmd;
        const isSubCmd =
          (CMD_GIT.has(base) && GIT_SUBCOMMANDS.has(word)) ||
          (CMD_NODE.has(base) && NPM_SUBCOMMANDS.has(word)) ||
          (CMD_DOCKER.has(base) && DOCKER_SUBCOMMANDS.has(word)) ||
          (SUDO_LIKE.has(base) && commandExists(word));
        if (isSubCmd) {
          tokens.push({ type: "subcommand", value: word });
          continue;
        }
      }
      if (isNumeric(word)) {
        tokens.push({ type: "number", value: word });
      } else {
        tokens.push({ type: "arg", value: word });
      }
    }
  }

  return tokens;
}

export function highlight(input: string): string {
  const tokens = tokenizeForHighlight(input);
  let out = "";
  let lastCmd = "";
  let lastFlag = "";

  for (const tok of tokens) {
    switch (tok.type) {
      case "command": {
        lastCmd = tok.value;
        lastFlag = "";
        out += commandExists(tok.value) ? cmdColor(tok.value) : chalk.hex("#FF6B7A")(tok.value);
        break;
      }
      case "subcommand": {
        out += subcommandColor(lastCmd, tok.value);
        break;
      }
      case "flag": {
        lastFlag = tok.value;
        out += flagColor(tok.value);
        break;
      }
      case "number": {
        out += numberArgColor(tok.value);
        break;
      }
      case "operator": {
        out += chalk.hex("#56D4D4")(tok.value);
        break;
      }
      case "redirect": {
        out += chalk.hex("#F0A05A")(tok.value);
        break;
      }
      case "string_d": {
        out += chalk.hex("#E8A062")(tok.value);
        break;
      }
      case "string_s": {
        out += chalk.hex("#A8D672")(tok.value);
        break;
      }
      case "incomplete_s": {
        out += chalk.hex("#C07840")(tok.value);
        break;
      }
      case "variable": {
        out += chalk.hex("#E070C8")(tok.value);
        break;
      }
      case "arg": {
        if (tok.value === " " || tok.value === "\t") {
          lastFlag = "";
          out += tok.value;
        } else {
          out += colorArg(tok.value, lastFlag);
          lastFlag = "";
        }
        break;
      }
      default:
        out += tok.value;
    }
  }

  return out;
}