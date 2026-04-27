import chalk from "chalk";
import { w, at, clr, C, R, drawNavbar, NavItem, drawBottomBar, enterAlt, exitAlt, clearScreen, visibleLen, padOrTrim } from "./tui";

type HelpEntry =
  | { kind: "section"; title: string }
  | { kind: "item"; key: string; desc: string }
  | { kind: "divider" };

const HELP_DATA: HelpEntry[] = [
  { kind: "section", title: "Shell Core" },
  { kind: "item", key: "cmd1 | cmd2",          desc: "pipe — stdout of cmd1 goes to stdin of cmd2" },
  { kind: "item", key: "cmd > file",            desc: "redirect stdout to file (overwrite)" },
  { kind: "item", key: "cmd >> file",           desc: "redirect stdout to file (append)" },
  { kind: "item", key: "cmd < file",            desc: "redirect stdin from file" },
  { kind: "item", key: "cmd1 && cmd2",          desc: "run cmd2 only if cmd1 succeeds (exit 0)" },
  { kind: "item", key: "cmd1 || cmd2",          desc: "run cmd2 only if cmd1 fails (non-zero exit)" },
  { kind: "item", key: "cmd1 ; cmd2",           desc: "run both commands sequentially regardless of exit code" },
  { kind: "item", key: "cmd &",                 desc: "run command in background (non-blocking)" },
  { kind: "item", key: "$HOME  $USER  $PATH",   desc: "environment variable expansion in any argument" },
  { kind: "item", key: "vim / htop / ssh",      desc: "full PTY support — interactive TUI apps work natively" },
  { kind: "item", key: "\\$var  'no expand'",   desc: "escape or single-quote to suppress variable expansion" },

  { kind: "section", title: "Built-in Commands" },
  { kind: "item", key: "ls",                    desc: "interactive file browser — grid layout, preview, git status" },
  { kind: "item", key: "dir",                   desc: "interactive directory-only browser — same features as ls" },
  { kind: "item", key: "cd [path]",             desc: "change directory — supports ~, ~/path, and relative paths" },
  { kind: "item", key: "clear / cls",           desc: "clear screen and scrollback buffer" },
  { kind: "item", key: "alias [name=value]",    desc: "create, list, or show aliases; no args = list all" },
  { kind: "item", key: "unalias <name>",        desc: "remove a defined alias by name" },
  { kind: "item", key: "history",               desc: "open general activity log (commands + file ops + trash)" },
  { kind: "item", key: "trash",                 desc: "open trash manager — browse, preview, restore, delete" },
  { kind: "item", key: "search",                desc: "open fuzzy search (same as Ctrl+R from the prompt)" },
  { kind: "item", key: "bookmarks",             desc: "open bookmark picker to jump to a saved directory" },
  { kind: "item", key: "fshrc init",            desc: "generate a default ~/.fshrc configuration file" },
  { kind: "item", key: "fshrc reload",          desc: "hot-reload ~/.fshrc without restarting the shell" },
  { kind: "item", key: "fshrc path",            desc: "print the full path to the active config file" },
  { kind: "item", key: "fshrc version",         desc: "show the current fsh version from package.json" },
  { kind: "item", key: "neofetch preview",      desc: "display system info with the FSH ASCII logo" },
  { kind: "item", key: "neofetch on / off",     desc: "enable or disable neofetch display on every startup" },
  { kind: "item", key: "fsh",                   desc: "show FSH shell info: developer, version, and tips" },
  { kind: "item", key: "source ~/.fshrc",       desc: "re-source the fshrc file to apply config changes" },
  { kind: "item", key: "echo / pwd / type",     desc: "standard shell utilities built into fsh" },
  { kind: "item", key: "helps",                 desc: "open this keyboard shortcut reference screen" },
  { kind: "item", key: "exit",                  desc: "exit fsh and return to the parent shell or session" },

  { kind: "section", title: "Prompt Shortcuts" },
  { kind: "item", key: "Tab  (empty line)",     desc: "open the visual command history picker" },
  { kind: "item", key: "Tab  (with text)",      desc: "auto-complete command, path, or alias inline" },
  { kind: "item", key: "Tab  (multi-match)",    desc: "show interactive completion picker when many candidates match" },
  { kind: "item", key: "Ctrl+R",               desc: "fuzzy search across history, files, dirs, builtins, executables" },
  { kind: "item", key: "Ctrl+H",               desc: "open general activity log (commands + file ops + trash)" },
  { kind: "item", key: "Ctrl+B",               desc: "open bookmark picker and cd to selected folder" },
  { kind: "item", key: "Ctrl+C",               desc: "cancel current input line and return a fresh prompt" },
  { kind: "item", key: "↑ ↓  (at prompt)",     desc: "navigate through command history inline" },

  { kind: "section", title: "ls / dir — File & Directory Browser" },
  { kind: "item", key: "↑ ↓ ← →",              desc: "navigate the file grid" },
  { kind: "item", key: "Home / End",            desc: "jump to first or last item in the grid" },
  { kind: "item", key: "Enter  (file)",         desc: "open with editor picker (choose from installed editors)" },
  { kind: "item", key: "Enter  (dir)",          desc: "enter directory — stays in browser, no alt-screen exit" },
  { kind: "item", key: "Enter  (image)",        desc: "open image in feh window (auto-sized and centered)" },
  { kind: "item", key: "Tab",                   desc: "go to parent directory" },
  { kind: "item", key: "Space",                 desc: "toggle selection on item at cursor" },
  { kind: "item", key: "A",                     desc: "select all items / deselect all if all already selected" },
  { kind: "item", key: "C",                     desc: "copy selected item(s) to clipboard" },
  { kind: "item", key: "X",                     desc: "cut selected item(s) to clipboard" },
  { kind: "item", key: "V",                     desc: "paste clipboard contents into the current directory" },
  { kind: "item", key: "R",                     desc: "rename item at cursor with an inline text input" },
  { kind: "item", key: "M",                     desc: "move mode — navigate to destination, press Y to confirm" },
  { kind: "item", key: "D",                     desc: "move selected item(s) to trash (shows preview before confirming)" },
  { kind: "item", key: "N",                     desc: "create new folder with inline text input" },
  { kind: "item", key: "T",                     desc: "create new file with inline text input (ls only)" },
  { kind: "item", key: "S",                     desc: "open sort picker overlay" },
  { kind: "item", key: "B",                     desc: "toggle bookmark on directory at cursor (gold = bookmarked)" },
  { kind: "item", key: "Ctrl+B",               desc: "open bookmark picker and cd to selected folder" },
  { kind: "item", key: "/",                     desc: "open quick search — recursive fuzzy search through subdirectories" },
  { kind: "item", key: "O  (on dir/preview)",   desc: "enter browse mode — navigate inside the preview panel" },
  { kind: "item", key: "O  (on image)",         desc: "open image in feh window" },
  { kind: "item", key: "O  (on text)",          desc: "enter preview mode — full cursor navigation inside the file" },
  { kind: "item", key: "P",                     desc: "toggle between split preview and overlay preview mode" },
  { kind: "item", key: ".",                     desc: "toggle hidden files (dotfiles) on or off" },
  { kind: "item", key: "PgUp / PgDn",          desc: "scroll preview panel content up or down" },
  { kind: "item", key: "H",                     desc: "open file operations log (copy / move / rename history)" },
  { kind: "item", key: "Esc  (clipboard)",      desc: "cancel active clipboard without leaving the browser" },
  { kind: "item", key: "Esc  (search)",         desc: "clear search query and return to normal view" },
  { kind: "item", key: "Esc  (selection)",      desc: "deselect all selected items" },
  { kind: "item", key: "Esc  (base)",           desc: "quit the browser and return to the shell prompt" },

  { kind: "section", title: "Preview Panel  (ls and dir)" },
  { kind: "item", key: "split mode",            desc: "terminal ≥ 110 cols — preview occupies right 40% of screen" },
  { kind: "item", key: "overlay mode",          desc: "terminal < 110 cols — 12-line preview above the bottom bar" },
  { kind: "item", key: "P",                     desc: "manually toggle between split and overlay mode" },
  { kind: "item", key: "PgUp / PgDn",          desc: "scroll the preview panel body without leaving the grid" },
  { kind: "item", key: "file preview",          desc: "shows syntax-highlighted content with line numbers" },
  { kind: "item", key: "file metadata",         desc: "size, modified date, permissions, file type — sticky header" },
  { kind: "item", key: "dir preview",           desc: "shows item count, dirs/files breakdown, size, and sorted listing" },
  { kind: "item", key: "image preview",         desc: "shows dimensions, size, modified date, and type in the panel" },
  { kind: "item", key: "video selection",       desc: "shows a 'Video Not Supported' overlay popup instead of crashing" },
  { kind: "item", key: "sticky headers",        desc: "file and directory metadata headers remain visible when scrolling" },

  { kind: "section", title: "Browse Mode  (O inside ls or dir)" },
  { kind: "item", key: "O",                     desc: "enter browse mode — navigate preview panel with keyboard" },
  { kind: "item", key: "↑ ↓",                  desc: "move cursor through directory listing in the preview panel" },
  { kind: "item", key: "PgUp / PgDn",          desc: "fast scroll 5 lines up or down in browse mode" },
  { kind: "item", key: "Enter  (on dir)",       desc: "drill into subdirectory without leaving the main browser" },
  { kind: "item", key: "Enter  (on file)",      desc: "open the file with the editor picker" },
  { kind: "item", key: "Enter  (on image)",     desc: "open image in feh window" },
  { kind: "item", key: "Space",                 desc: "cd into the directory currently shown in the preview panel" },
  { kind: "item", key: "Tab",                   desc: "go up one level in the preview panel directory" },
  { kind: "item", key: "Esc",                   desc: "exit browse mode and return to normal grid navigation" },

  { kind: "section", title: "Preview Mode  (O on a text file)" },
  { kind: "item", key: "O  (on text file)",     desc: "enter full preview mode with editor-like cursor navigation" },
  { kind: "item", key: "↑ ↓",                  desc: "move cursor row by row through file content" },
  { kind: "item", key: "← →",                  desc: "move cursor column by column with horizontal scrolling" },
  { kind: "item", key: "wrap + edge scroll",    desc: "cursor wraps to next/prev line at line boundaries" },
  { kind: "item", key: "Esc",                   desc: "exit preview mode and return to grid navigation" },

  { kind: "section", title: "Quick Search  (/ inside ls or dir)" },
  { kind: "item", key: "/",                     desc: "open search mode — bottom bar becomes a live search input" },
  { kind: "item", key: "type to filter",        desc: "fuzzy match across all subdirectories in real time (depth 4)" },
  { kind: "item", key: "↑ ↓ ← →",              desc: "navigate filtered results while search mode is active" },
  { kind: "item", key: "Enter",                 desc: "confirm — close search bar while keeping filter active" },
  { kind: "item", key: "Enter  (on dir)",       desc: "navigate into the matched directory and clear the search" },
  { kind: "item", key: "Enter  (on file)",      desc: "open the matched file with the editor picker" },
  { kind: "item", key: "Esc",                   desc: "clear the search query and return to normal view" },
  { kind: "item", key: "result paths",          desc: "results show relative path from current dir (e.g. src/main.ts)" },
  { kind: "item", key: "max 200 results",       desc: "capped at 200 results to keep performance fast" },
  { kind: "item", key: "auto-skipped dirs",     desc: "node_modules · .git · dist · build · .next · __pycache__" },

  { kind: "section", title: "Clipboard & Multi-Select" },
  { kind: "item", key: "Space",                 desc: "toggle selection on the item at cursor" },
  { kind: "item", key: "A",                     desc: "select all / deselect all" },
  { kind: "item", key: "C  (multi-select)",     desc: "copy all selected items into a single clipboard operation" },
  { kind: "item", key: "X  (multi-select)",     desc: "cut all selected items into a single clipboard operation" },
  { kind: "item", key: "V",                     desc: "paste all clipboard items into current directory sequentially" },
  { kind: "item", key: "clipboard indicator",   desc: "bottom bar shows item count when multiple items are selected" },
  { kind: "item", key: "error report",          desc: "after paste, error count is reported; successful items still land" },
  { kind: "item", key: "persistent clipboard",  desc: "clipboard stays active across folder navigation (copy → navigate → paste)" },
  { kind: "item", key: "Esc",                   desc: "cancel clipboard without quitting; selection cleared separately" },

  { kind: "section", title: "Sort Options  (S)" },
  { kind: "item", key: "S  in ls / dir",        desc: "open sort picker overlay for the file grid" },
  { kind: "item", key: "Name A→Z / Z→A",        desc: "sort alphabetically ascending or descending" },
  { kind: "item", key: "Type",                  desc: "dirs first then files, alphabetically within each group" },
  { kind: "item", key: "Size large / small",    desc: "sort by file or folder size descending or ascending" },
  { kind: "item", key: "Date newest / oldest",  desc: "sort by modification time newest-first or oldest-first" },
  { kind: "item", key: "Hidden last",           desc: "push dotfiles to the bottom, all others sorted alphabetically" },
  { kind: "item", key: "S  in trash",           desc: "sort trash entries by date, name, size, or type" },
  { kind: "item", key: "S  in file ops log",    desc: "sort log entries by date, kind, or status" },

  { kind: "section", title: "Inline File & Folder Creation" },
  { kind: "item", key: "N  in ls / dir",        desc: "create new folder — type name and press Enter to confirm" },
  { kind: "item", key: "T  in ls",              desc: "create new file — type name and press Enter to confirm" },
  { kind: "item", key: "Esc  (in input)",       desc: "cancel creation without creating anything" },
  { kind: "item", key: "auto-jump",             desc: "cursor automatically moves to the newly created item" },
  { kind: "item", key: "duplicate check",       desc: "creation is blocked if a file or folder with that name exists" },

  { kind: "section", title: "Git Status in Browser" },
  { kind: "item", key: "bottom bar indicator",  desc: "shows git repo name and branch for the folder under the cursor" },
  { kind: "item", key: "git: repo (branch)",    desc: "green — folder is inside a git repository" },
  { kind: "item", key: "no git",               desc: "red — folder has no git history" },
  { kind: "item", key: "main / master branch",  desc: "branch shown in gold color for main/master" },
  { kind: "item", key: "dev / develop branch",  desc: "branch shown in cyan color for dev/develop" },
  { kind: "item", key: "~  yellow",             desc: "modified file — has unstaged changes" },
  { kind: "item", key: "+  green",              desc: "staged or added — ready to commit" },
  { kind: "item", key: "?  orange",             desc: "untracked — not yet added to git" },
  { kind: "item", key: "-  red",                desc: "deleted — removed from working tree" },
  { kind: "item", key: "→  blue",               desc: "renamed — file was moved or renamed" },
  { kind: "item", key: "!  bright red",         desc: "merge conflict — requires manual resolution" },

  { kind: "section", title: "Bookmarks  (bookmarks / Ctrl+B)" },
  { kind: "item", key: "B  in ls / dir",        desc: "toggle bookmark on directory at cursor" },
  { kind: "item", key: "gold color",            desc: "bookmarked directory shown in gold in the grid" },
  { kind: "item", key: "Ctrl+B",               desc: "open bookmark picker from the prompt or inside ls/dir" },
  { kind: "item", key: "bookmarks command",     desc: "same as Ctrl+B — open picker from the shell prompt" },
  { kind: "item", key: "Enter  in picker",      desc: "cd to the bookmarked folder" },
  { kind: "item", key: "X  in picker",          desc: "remove bookmark from the list" },
  { kind: "item", key: "Esc",                   desc: "cancel picker without navigating" },
  { kind: "item", key: "~/.fsh_bookmarks.json", desc: "bookmarks persist here across sessions" },

  { kind: "section", title: "File Operations Log  (H inside ls/dir)" },
  { kind: "item", key: "H  in ls / dir",        desc: "open the file operations log panel" },
  { kind: "item", key: "Ctrl+H",               desc: "open general activity log from the shell prompt" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate log entries" },
  { kind: "item", key: "Space",                 desc: "select / deselect entry" },
  { kind: "item", key: "A",                     desc: "select all / deselect all entries" },
  { kind: "item", key: "Enter",                 desc: "view full detail of the selected operation" },
  { kind: "item", key: "U",                     desc: "undo — reverse the operation (move back / rename back / remove copy)" },
  { kind: "item", key: "X",                     desc: "delete selected log entries (files are not affected)" },
  { kind: "item", key: "S",                     desc: "change sort order of log entries" },
  { kind: "item", key: "undo indicator ↩",      desc: "shown next to entries that can still be undone" },
  { kind: "item", key: "Esc",                   desc: "go back to the file browser" },

  { kind: "section", title: "Undo File Operations  (U in log)" },
  { kind: "item", key: "copy → undo",           desc: "permanently delete the copy at the destination path" },
  { kind: "item", key: "move → undo",           desc: "move the item back to its original location" },
  { kind: "item", key: "cut → undo",            desc: "move the item back to its original location" },
  { kind: "item", key: "rename → undo",         desc: "rename the item back to its original name" },
  { kind: "item", key: "↩ indicator",           desc: "visible only when undo is still possible" },
  { kind: "item", key: "undo not available",    desc: "shown if files were moved or deleted since the operation" },

  { kind: "section", title: "Trash Manager  (trash)" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate trash entries" },
  { kind: "item", key: "Space",                 desc: "select / deselect item" },
  { kind: "item", key: "A",                     desc: "select all / deselect all for bulk operations" },
  { kind: "item", key: "Enter",                 desc: "preview file or directory contents" },
  { kind: "item", key: "O  (in preview)",       desc: "browse directory listing of a trashed folder" },
  { kind: "item", key: "R",                     desc: "restore item to its original location" },
  { kind: "item", key: "X",                     desc: "delete item forever with confirmation dialog" },
  { kind: "item", key: "D",                     desc: "empty entire trash with confirmation dialog" },
  { kind: "item", key: "S",                     desc: "change sort order (date / name / size / type)" },
  { kind: "item", key: "Esc",                   desc: "deselect all / quit trash manager" },
  { kind: "item", key: "restore conflict",      desc: "if original path is taken, restores as filename(restored)" },

  { kind: "section", title: "Activity Log  (history / Ctrl+H)" },
  { kind: "item", key: "history command",       desc: "open the general activity log from the prompt" },
  { kind: "item", key: "Ctrl+H",               desc: "same as history command — open from the prompt" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate category headers and entries" },
  { kind: "item", key: "Enter  on category",    desc: "open category editor (Commands / File Mutations / Trash Ops)" },
  { kind: "item", key: "Enter  on entry",       desc: "view full detail of the selected event" },
  { kind: "item", key: "Enter  (show more)",    desc: "expand category to show all entries beyond preview" },
  { kind: "item", key: "Esc",                   desc: "go back to the main shell prompt" },

  { kind: "section", title: "Activity Log — Category Editor" },
  { kind: "item", key: "Enter on category",     desc: "open the dedicated editor for that category" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate entries within the category" },
  { kind: "item", key: "Space",                 desc: "select / deselect entry" },
  { kind: "item", key: "A",                     desc: "select all / deselect all" },
  { kind: "item", key: "Enter  (Commands)",     desc: "paste command to the prompt and execute it immediately" },
  { kind: "item", key: "Enter  (other)",        desc: "open detail view for the selected entry" },
  { kind: "item", key: "X",                     desc: "delete selected entries (with confirmation)" },
  { kind: "item", key: "D",                     desc: "delete all entries in the category at once" },
  { kind: "item", key: "Esc",                   desc: "return to main activity log without losing scroll position" },

  { kind: "section", title: "Fuzzy Search  (search / Ctrl+R)" },
  { kind: "item", key: "Ctrl+R / search",       desc: "open full-screen fuzzy search from the prompt" },
  { kind: "item", key: "type to filter",        desc: "searches all sources simultaneously in real time" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate results (skips category headers automatically)" },
  { kind: "item", key: "Enter  (command)",      desc: "paste command / builtin / alias / executable to the prompt" },
  { kind: "item", key: "Enter  (directory)",    desc: "open directory action panel — cd into or delete" },
  { kind: "item", key: "Enter  (file)",         desc: "open file preview with scrollable content" },
  { kind: "item", key: "↑ ↓ / PgUp/PgDn",     desc: "scroll file content in the file preview panel" },
  { kind: "item", key: "Enter  (file preview)", desc: "open editor picker to open the file in an editor" },
  { kind: "item", key: "← →  (editor)",        desc: "navigate editor choices in the picker row" },
  { kind: "item", key: "D  (in detail view)",   desc: "move file or directory to trash with confirmation" },
  { kind: "item", key: "Esc  (detail view)",    desc: "return to search results from detail or preview" },
  { kind: "item", key: "Esc  (search)",         desc: "cancel search and return to the shell prompt" },
  { kind: "item", key: "sources searched",      desc: "history · files · directories · builtins · aliases · executables" },

  { kind: "section", title: "Command History Picker  (Tab on empty line)" },
  { kind: "item", key: "Tab  (empty prompt)",   desc: "open visual history picker grouped by time" },
  { kind: "item", key: "Last hour / Today etc", desc: "groups: Last hour, Today, Yesterday, This week, Older" },
  { kind: "item", key: "↑ ↓",                  desc: "navigate entries and group headers" },
  { kind: "item", key: "Space",                 desc: "select / deselect entry for bulk delete" },
  { kind: "item", key: "A",                     desc: "select all / deselect all entries" },
  { kind: "item", key: "Enter",                 desc: "use command — paste and execute immediately" },
  { kind: "item", key: "X / Delete",            desc: "delete selected entries or entire group at cursor" },
  { kind: "item", key: "D",                     desc: "delete all history with confirmation" },
  { kind: "item", key: "Esc",                   desc: "deselect all / close history picker" },

  { kind: "section", title: "Tab Completion" },
  { kind: "item", key: "Tab  (single match)",   desc: "auto-complete inline — no picker shown" },
  { kind: "item", key: "Tab  (common prefix)",  desc: "extend input to the longest shared prefix" },
  { kind: "item", key: "Tab  (multi-match)",    desc: "open interactive picker with all candidates" },
  { kind: "item", key: "completion sources",    desc: "commands, file paths, aliases, fshrc subcommands" },
  { kind: "item", key: "source ~/.fshrc",       desc: "Tab after 'source' suggests ~/.fshrc specifically" },
  { kind: "item", key: "fshrc / neofetch",      desc: "Tab after these shows their valid subcommands" },
  { kind: "item", key: "Tab  (in picker)",      desc: "switch from completion picker to history picker" },

  { kind: "section", title: "Git Prompt Indicators" },
  { kind: "item", key: "●  green",              desc: "staged changes — added with git add" },
  { kind: "item", key: "✚  yellow",             desc: "modified files — changes not yet staged" },
  { kind: "item", key: "…  red",                desc: "untracked files — not in the index" },
  { kind: "item", key: "↑N  cyan",              desc: "N commits ahead of the remote branch" },
  { kind: "item", key: "↓N  red",               desc: "N commits behind the remote branch" },
  { kind: "item", key: "prompt format",         desc: "fsh/foldername (branch ●↑2) >" },

  { kind: "section", title: "Syntax Highlight Colors" },
  { kind: "item", key: "bright green",          desc: "valid builtin command (ls, cd, clear, history…)" },
  { kind: "item", key: "light green",           desc: "defined alias" },
  { kind: "item", key: "red",                   desc: "invalid or unknown command — not found in PATH" },
  { kind: "item", key: "purple",                desc: "editor commands (vim, nvim, nano, code, hx…)" },
  { kind: "item", key: "orange",                desc: "git tools (git, gh, hub)" },
  { kind: "item", key: "teal",                  desc: "node/npm tools (node, npm, npx, yarn, bun…)" },
  { kind: "item", key: "gold",                  desc: "python tools (python, pip, poetry…)" },
  { kind: "item", key: "red-pink",              desc: "system/sudo commands (sudo, kill, apt, systemctl…)" },
  { kind: "item", key: "light blue",            desc: "network tools (curl, wget, ssh, ping…)" },
  { kind: "item", key: "light green",           desc: "file ops (cp, mv, rm, grep, find, tar…)" },
  { kind: "item", key: "sky blue",              desc: "docker/k8s (docker, kubectl, helm…)" },
  { kind: "item", key: "yellow",                desc: "build tools (make, tsc, cargo, gcc…)" },
  { kind: "item", key: "blue-grey",             desc: "shell utils (bash, env, which, man…)" },
  { kind: "item", key: "semantic subcommands",  desc: "git add → green · git reset → red · npm run → green" },
  { kind: "item", key: "flags  (-v --help)",    desc: "yellow / light blue depending on flag name" },
  { kind: "item", key: "destructive flags",     desc: "--force --delete --purge → red" },
  { kind: "item", key: "cyan",                  desc: "pipe and logical operators  (|  &&  ||)" },
  { kind: "item", key: "orange",                desc: "redirects  (>  >>  <)" },
  { kind: "item", key: "orange-gold",           desc: "double-quoted strings  (\"hello\")" },
  { kind: "item", key: "light green",           desc: "single-quoted strings  ('hello')" },
  { kind: "item", key: "amber",                 desc: "incomplete / unterminated strings" },
  { kind: "item", key: "magenta",               desc: "environment variables  ($HOME  $USER  $PATH)" },
  { kind: "item", key: "orange",                desc: "numeric arguments  (5, 1234, 3.14)" },
  { kind: "item", key: "blue / white / dim-red",desc: "path arguments — colored by whether path exists and type" },

  { kind: "section", title: "Image Preview  (feh)" },
  { kind: "item", key: "supported formats",     desc: "png · jpg · jpeg · gif · bmp · webp · ico · tiff · tif" },
  { kind: "item", key: "Enter  on image",       desc: "open image in auto-sized feh window" },
  { kind: "item", key: "O  on image",           desc: "same as Enter — open in feh" },
  { kind: "item", key: "auto-sizing",           desc: "fsh reads raw dimensions from binary headers to size the window" },
  { kind: "item", key: "auto-centering",        desc: "feh window is centered on screen automatically" },
  { kind: "item", key: "auto-close",            desc: "feh window closes when you navigate away or exit the browser" },
  { kind: "item", key: "Esc  with feh open",    desc: "close feh preview without leaving the browser" },
  { kind: "item", key: "shell exit cleanup",    desc: "feh is killed on shell exit or Ctrl+C to avoid orphan processes" },

  { kind: "section", title: "Startup Behavior" },
  { kind: "item", key: "fresh terminal",        desc: "fsh shows neofetch with custom ASCII logo (if enabled)" },
  { kind: "item", key: "launched from shell",   desc: "fsh shows a clean professional banner instead of neofetch" },
  { kind: "item", key: "neofetch on / off",     desc: "toggle neofetch at startup with: neofetch on / neofetch off" },
  { kind: "item", key: "neofetch preview",      desc: "preview without changing startup setting" },
  { kind: "item", key: "neofetch content",      desc: "OS, kernel, shell version, CPU, RAM, disk, uptime, IP, palette" },

  { kind: "section", title: "Config File  (~/.fshrc)" },
  { kind: "item", key: "alias ll='ls -la'",     desc: "define a shell alias" },
  { kind: "item", key: "export EDITOR=nano",    desc: "set an environment variable for the session" },
  { kind: "item", key: "# comment",             desc: "lines starting with # are ignored" },
  { kind: "item", key: "fshrc reload",          desc: "hot-reload config without restarting — all modules refresh" },
  { kind: "item", key: "fshrc init",            desc: "generate a default config with common aliases and exports" },
  { kind: "item", key: "source ~/.fshrc",       desc: "alternative way to reload — Tab completion suggests it" },

  { kind: "section", title: "Data Files" },
  { kind: "item", key: "~/.fsh_history",              desc: "command history — max 500 unique commands" },
  { kind: "item", key: "~/.fsh_general_history.json", desc: "all activity log — commands, file ops, trash — max 500 events" },
  { kind: "item", key: "~/.fsh_fileops.json",         desc: "file operations log — copy, move, rename — max 200 entries" },
  { kind: "item", key: "~/.fsh_trash/",               desc: "trashed files storage directory" },
  { kind: "item", key: "~/.fsh_trash/.meta.json",     desc: "trash metadata — original paths and timestamps" },
  { kind: "item", key: "~/.fsh_bookmarks.json",       desc: "saved bookmark directories" },
  { kind: "item", key: "~/.fshrc",                    desc: "shell config — aliases and environment variables" },
  { kind: "item", key: "~/.fsh_neofetch",             desc: "neofetch on/off startup state" },

  { kind: "section", title: "TUI Layout" },
  { kind: "item", key: "navbar  (row 1-2)",     desc: "adaptive keyboard shortcut bar — collapses on narrow terminals" },
  { kind: "item", key: "separator",             desc: "dim horizontal line below the navbar" },
  { kind: "item", key: "content area",          desc: "main file grid or list — occupies all available rows" },
  { kind: "item", key: "minibar  (row R-1)",    desc: "quick-access hints: N New · T File · S Sort · B Bookmark · / Search" },
  { kind: "item", key: "bottom bar  (row R)",   desc: "path · counts · git status · clipboard state · scroll indicator" },
  { kind: "item", key: "1-row navbar",          desc: "used when 7 or fewer shortcuts fit on one line" },
  { kind: "item", key: "2-row navbar",          desc: "used when shortcuts overflow a single row" },
  { kind: "item", key: "responsive layout",     desc: "all screens recalculate on terminal resize — even while active" },
];

export function showHelps(onBack: () => void): void {
  const stdin   = process.stdin;
  let scrollTop = 0;
  let sel       = 0;

  const NAV: NavItem[] = [
    { key: "↑↓ / jk",   label: "Scroll"      },
    { key: "PgUp/PgDn", label: "Fast scroll"  },
    { key: "g / G",     label: "Top / Bottom" },
    { key: "Esc",       label: "Close"        },
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
    return Math.min(34, Math.floor(C() * 0.36));
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