import chalk from "chalk";
import { w, at, clr, C, R, drawNavbar, NavItem, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";

type HelpEntry =
  | { kind: "section"; title: string }
  | { kind: "item"; key: string; desc: string }
  | { kind: "divider" };

const HELP_DATA: HelpEntry[] = [
  { kind: "section", title: "Shell Core" },
  { kind: "item", key: "cmd1 | cmd2",         desc: "pipe — stdout of cmd1 goes to stdin of cmd2" },
  { kind: "item", key: "cmd >> file",          desc: "append redirect  /  cmd > file  overwrite  /  cmd < file  read" },
  { kind: "item", key: "cmd1 && cmd2",         desc: "run cmd2 only if cmd1 succeeds" },
  { kind: "item", key: "cmd1 || cmd2",         desc: "run cmd2 only if cmd1 fails" },
  { kind: "item", key: "cmd1 ; cmd2",          desc: "run both commands sequentially" },
  { kind: "item", key: "cmd &",                desc: "run command in background" },
  { kind: "item", key: "$HOME  $USER",         desc: "environment variable expansion" },
  { kind: "item", key: "vim / htop / ssh",     desc: "full PTY support for interactive apps" },

  { kind: "section", title: "Built-in Commands" },
  { kind: "item", key: "ls",                   desc: "interactive file browser with grid layout" },
  { kind: "item", key: "dir",                  desc: "interactive directory-only browser" },
  { kind: "item", key: "cd [path]",            desc: "change directory — supports ~ and ~/path" },
  { kind: "item", key: "clear",                desc: "clear screen and scrollback buffer" },
  { kind: "item", key: "alias [name=value]",   desc: "create, list, or remove aliases" },
  { kind: "item", key: "history",              desc: "open general activity log (commands + file ops + trash)" },
  { kind: "item", key: "trash",                desc: "open trash manager — browse, restore, delete" },
  { kind: "item", key: "search",               desc: "open fuzzy search (same as Ctrl+R)" },
  { kind: "item", key: "bookmarks",            desc: "open bookmark picker (same as Ctrl+B)" },
  { kind: "item", key: "fshrc init",           desc: "create default ~/.fshrc config file" },
  { kind: "item", key: "fshrc reload",         desc: "reload ~/.fshrc without restarting shell" },
  { kind: "item", key: "fshrc path",           desc: "print path to config file" },
  { kind: "item", key: "neofetch",             desc: "display system info with FSH logo" },
  { kind: "item", key: "neofetch on / off",    desc: "toggle neofetch display on startup" },
  { kind: "item", key: "echo / pwd / type",    desc: "standard shell utilities" },
  { kind: "item", key: "helps",                desc: "show this help screen" },
  { kind: "item", key: "exit",                 desc: "exit the shell" },

  { kind: "section", title: "Prompt Shortcuts" },
  { kind: "item", key: "Tab  (empty line)",    desc: "open command history picker" },
  { kind: "item", key: "Tab  (with text)",     desc: "auto-complete command or file path" },
  { kind: "item", key: "Ctrl+R",               desc: "fuzzy search across history, files, dirs, builtins, executables" },
  { kind: "item", key: "Ctrl+H",               desc: "open general activity log" },
  { kind: "item", key: "Ctrl+B",               desc: "open bookmark picker" },
  { kind: "item", key: "Ctrl+C",               desc: "cancel current input line" },

  { kind: "section", title: "ls / dir — File & Directory Browser" },
  { kind: "item", key: "↑ ↓ ← →",             desc: "navigate grid" },
  { kind: "item", key: "Enter  (file)",        desc: "open with editor picker" },
  { kind: "item", key: "Enter  (dir)",         desc: "enter directory — stays in browser, no exit" },
  { kind: "item", key: "Tab",                  desc: "go to parent directory" },
  { kind: "item", key: "Space",                desc: "select / deselect item" },
  { kind: "item", key: "A",                    desc: "select all / deselect all" },
  { kind: "item", key: "C",                    desc: "copy selected item(s) to clipboard" },
  { kind: "item", key: "X",                    desc: "cut selected item(s) to clipboard" },
  { kind: "item", key: "V",                    desc: "paste clipboard contents to current directory" },
  { kind: "item", key: "R",                    desc: "rename item at cursor (inline text input)" },
  { kind: "item", key: "M",                    desc: "move — navigate to destination folder, press Y to confirm" },
  { kind: "item", key: "D",                    desc: "move to trash (shows preview before confirming)" },
  { kind: "item", key: "N",                    desc: "create new folder (inline input)" },
  { kind: "item", key: "T",                    desc: "create new file (inline input)" },
  { kind: "item", key: "S",                    desc: "change sort order (name / type / size / date / hidden last)" },
  { kind: "item", key: "B",                    desc: "toggle bookmark on directory at cursor (gold = bookmarked)" },
  { kind: "item", key: "Ctrl+B",               desc: "open bookmark picker and cd to selected folder" },
  { kind: "item", key: "/",                    desc: "quick search — recursive fuzzy search through subdirectories" },
  { kind: "item", key: "O",                    desc: "browse mode — navigate inside the preview panel" },
  { kind: "item", key: "P",                    desc: "toggle split preview / overlay preview" },
  { kind: "item", key: ".",                    desc: "toggle hidden files on / off" },
  { kind: "item", key: "PgUp / PgDn",         desc: "scroll preview panel" },
  { kind: "item", key: "H",                    desc: "open file operations log (copy / move / rename history)" },
  { kind: "item", key: "Esc",                  desc: "cancel clipboard / clear search / deselect all / quit browser" },

  { kind: "section", title: "Quick Search  (/ inside ls or dir)" },
  { kind: "item", key: "/",                    desc: "open search mode — bottom bar becomes a live search input" },
  { kind: "item", key: "type to search",       desc: "fuzzy match across all subdirectories in real time (depth 4)" },
  { kind: "item", key: "↑ ↓ ← →",             desc: "navigate filtered results while search mode is active" },
  { kind: "item", key: "Enter",                desc: "confirm — closes search bar, filter stays active" },
  { kind: "item", key: "Esc",                  desc: "clear search and return to normal view" },
  { kind: "item", key: "result paths",         desc: "results show relative path from current dir (e.g. src/main.ts)" },
  { kind: "item", key: "auto-skipped dirs",    desc: "node_modules · .git · dist · build · .next · __pycache__" },

  { kind: "section", title: "Git Status in Browser" },
  { kind: "item", key: "bottom bar",           desc: "shows git repo name and branch for the folder under the cursor" },
  { kind: "item", key: "git: repo (branch)",   desc: "green — folder is inside a git repository" },
  { kind: "item", key: "no git",               desc: "red — folder has no git history" },
  { kind: "item", key: "~  yellow",            desc: "modified file — has unstaged changes" },
  { kind: "item", key: "+  green",             desc: "staged or added — ready to commit" },
  { kind: "item", key: "?  orange",            desc: "untracked — not yet added to git" },
  { kind: "item", key: "-  red",               desc: "deleted — removed from working tree" },
  { kind: "item", key: "→  blue",              desc: "renamed — file was moved or renamed" },
  { kind: "item", key: "!  bright red",        desc: "merge conflict — requires manual resolution" },

  { kind: "section", title: "Trash Manager  (trash)" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate entries" },
  { kind: "item", key: "Enter",                 desc: "preview file or directory contents" },
  { kind: "item", key: "R",                     desc: "restore item to its original location" },
  { kind: "item", key: "X",                     desc: "delete item forever (with confirmation)" },
  { kind: "item", key: "D",                     desc: "empty entire trash (with confirmation)" },
  { kind: "item", key: "Space / A",             desc: "select / select all for bulk operations" },
  { kind: "item", key: "S",                     desc: "change sort order" },
  { kind: "item", key: "Esc",                   desc: "deselect / quit" },

  { kind: "section", title: "Activity Log  (history / Ctrl+H)" },
  { kind: "item", key: "Enter  on category",   desc: "open category editor (Commands / File Mutations / Trash Ops)" },
  { kind: "item", key: "Enter  on entry",      desc: "view full detail" },
  { kind: "item", key: "Space / A",             desc: "select / select all entries" },
  { kind: "item", key: "X",                     desc: "delete selected entries from log" },
  { kind: "item", key: "D",                     desc: "delete all entries in category" },
  { kind: "item", key: "Enter  (Commands)",    desc: "paste command to prompt and use it" },
  { kind: "item", key: "Esc",                   desc: "deselect / go back" },

  { kind: "section", title: "File Operations Log  (H inside ls/dir)" },
  { kind: "item", key: "Enter",                 desc: "view full detail of the operation" },
  { kind: "item", key: "U",                     desc: "undo — reverse the operation (move back / rename back / remove copy)" },
  { kind: "item", key: "X",                     desc: "delete log entry (files not affected)" },
  { kind: "item", key: "Space / A",             desc: "select / select all" },
  { kind: "item", key: "S",                     desc: "change sort order" },
  { kind: "item", key: "Esc",                   desc: "back" },

  { kind: "section", title: "Fuzzy Search  (search / Ctrl+R)" },
  { kind: "item", key: "type to filter",        desc: "searches all sources simultaneously in real time" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate results" },
  { kind: "item", key: "Enter  (command)",     desc: "paste command / builtin / alias / executable to prompt" },
  { kind: "item", key: "Enter  (directory)",   desc: "cd into the directory" },
  { kind: "item", key: "Enter  (file)",        desc: "open with editor picker" },
  { kind: "item", key: "Esc",                   desc: "cancel and return to prompt" },
  { kind: "item", key: "Sources searched",     desc: "history · files · directories · builtins · aliases · executables" },

  { kind: "section", title: "Bookmarks  (bookmarks / Ctrl+B)" },
  { kind: "item", key: "B  in ls / dir",       desc: "toggle bookmark on directory at cursor" },
  { kind: "item", key: "gold color",           desc: "directory is bookmarked (shown in ls and dir)" },
  { kind: "item", key: "Enter",                 desc: "cd to the bookmarked folder" },
  { kind: "item", key: "X",                     desc: "remove bookmark from list" },
  { kind: "item", key: "Esc",                   desc: "cancel" },
  { kind: "item", key: "~/.fsh_bookmarks.json", desc: "bookmarks are persisted here" },

  { kind: "section", title: "Git Prompt Indicators" },
  { kind: "item", key: "●  green",             desc: "staged changes (git add)" },
  { kind: "item", key: "✚  yellow",            desc: "modified files (not staged)" },
  { kind: "item", key: "…  red",               desc: "untracked files" },
  { kind: "item", key: "↑N  cyan",             desc: "N commits ahead of remote" },
  { kind: "item", key: "↓N  red",              desc: "N commits behind remote" },

  { kind: "section", title: "Syntax Highlight Colors" },
  { kind: "item", key: "green",                desc: "valid command / builtin / alias" },
  { kind: "item", key: "red",                  desc: "invalid or unknown command" },
  { kind: "item", key: "yellow",               desc: "flags and options  (-v  --help  --output)" },
  { kind: "item", key: "cyan",                 desc: "pipe and logical operators  (|  &&  ||)" },
  { kind: "item", key: "orange",               desc: "operators and redirects  (>  >>  <)" },
  { kind: "item", key: "gold",                 desc: "double-quoted strings" },
  { kind: "item", key: "light green",          desc: "single-quoted strings" },
  { kind: "item", key: "magenta",              desc: "variables  ($HOME  $USER  $PATH)" },

  { kind: "section", title: "Config File  (~/.fshrc)" },
  { kind: "item", key: "alias ll='ls -la'",    desc: "define a command alias" },
  { kind: "item", key: "export EDITOR=nano",   desc: "set an environment variable" },
  { kind: "item", key: "fshrc reload",         desc: "apply changes without restarting the shell" },

  { kind: "section", title: "Data Files" },
  { kind: "item", key: "~/.fsh_history",               desc: "command history  (max 500 unique commands)" },
  { kind: "item", key: "~/.fsh_general_history.json",  desc: "all activity log  (max 500 events)" },
  { kind: "item", key: "~/.fsh_fileops.json",          desc: "file operations log  (max 200 entries)" },
  { kind: "item", key: "~/.fsh_trash/",                desc: "trashed files storage" },
  { kind: "item", key: "~/.fsh_bookmarks.json",        desc: "saved bookmarks" },
  { kind: "item", key: "~/.fshrc",                     desc: "shell config: aliases and environment variables" },
  { kind: "item", key: "~/.fsh_neofetch",              desc: "neofetch on/off state" },
];

export function showHelps(onBack: () => void): void {
  const stdin   = process.stdin;
  let scrollTop = 0;
  let sel       = 0;

  const NAV: NavItem[] = [
    { key: "↑↓", label: "Scroll"       },
    { key: "PgUp/Dn", label: "Fast scroll" },
    { key: "Esc", label: "Close"        },
  ];

  const NR = 2;

  function vis(): number { return Math.max(1, R() - NR - 2); }

  function adjustScroll(): void {
    const v = vis();
    if (sel < scrollTop)      scrollTop = sel;
    if (sel >= scrollTop + v) scrollTop = sel - v + 1;
  }

  function buildRight(): string {
    if (HELP_DATA.length <= vis()) return "";
    const more = HELP_DATA.length - (scrollTop + vis());
    return more > 0 ? `↓ ${more} more` : "end";
  }

  function keyW(): number {
    return Math.min(32, Math.floor(C() * 0.35));
  }

  function drawContent(): void {
    const start = NR + 2;
    const cols  = C();
    const v     = vis();
    const kw    = keyW();
    let out = "";

    for (let i = 0; i < v; i++) {
      out += at(start + i, 1) + "\x1b[2K\x1b[0m";
      const entry = HELP_DATA[scrollTop + i];
      if (!entry) continue;
      const isActive = (scrollTop + i) === sel;

      if (entry.kind === "section") {
        const title = "  " + entry.title.toUpperCase();
        const line  = title + " " + chalk.dim("─".repeat(Math.max(0, cols - title.length - 2)));
        out += isActive
          ? chalk.bgWhite.black.bold(padOrTrim("  " + entry.title.toUpperCase(), cols))
          : chalk.cyan.bold(line);

      } else if (entry.kind === "divider") {
        out += chalk.dim("  " + "─".repeat(cols - 4));

      } else {
        const keyStr  = entry.key;
        const descStr = entry.desc;
        const keyTrunc = keyStr.length > kw - 2
          ? keyStr.slice(0, kw - 3) + "…"
          : keyStr;
        const keyPadded = keyTrunc.padEnd(kw, " ");
        const descMaxW  = cols - kw - 5;
        const descTrunc = descStr.length > descMaxW
          ? descStr.slice(0, descMaxW - 1) + "…"
          : descStr;

        if (isActive) {
          out += chalk.bgWhite.black.bold(padOrTrim(
            "  " + keyPadded + "  " + descTrunc, cols
          ));
        } else {
          out += "  " + chalk.hex("#FFD580")(keyPadded) + "  " + chalk.white(descTrunc);
        }
      }
    }
    w(out);
  }

  function buildLeft(): string {
    return `FSH Help  ${HELP_DATA.filter(e => e.kind === "item").length} shortcuts`;
  }

  function fullDraw(): void {
    drawNavbar([NAV]);
    drawContent();
    drawBottomBar(buildLeft(), buildRight());
  }

  function onResize(): void { clearScreen(); adjustScroll(); fullDraw(); }

  function cleanup(): void {
    process.stdout.removeListener("resize", onResize);
    stdin.removeAllListeners("data");
    clearScreen();
    exitAlt();
  }

  function exit(): void { cleanup(); setTimeout(onBack, 20); }

  function navigate(delta: number): void {
    const total = HELP_DATA.length;
    sel = Math.max(0, Math.min(total - 1, sel + delta));
    adjustScroll();
    fullDraw();
  }

  function onKey(k: string): void {
    if (k === "\u001b" || k === "\u0003" || k === "q") { exit(); return; }
    if (k === "\u001b[A" || k === "k")  { navigate(-1);          return; }
    if (k === "\u001b[B" || k === "j")  { navigate(1);           return; }
    if (k === "\u001b[5~")              { navigate(-vis());       return; }
    if (k === "\u001b[6~")              { navigate(vis());        return; }
    if (k === "\u001b[H" || k === "g")  { sel = 0; adjustScroll(); fullDraw(); return; }
    if (k === "\u001b[F" || k === "G")  { sel = HELP_DATA.length - 1; adjustScroll(); fullDraw(); return; }
    if (k.startsWith("\u001b"))         return;
  }

  process.stdout.on("resize", onResize);
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.on("data", onKey);
  enterAlt();
  clearScreen();
  fullDraw();
}