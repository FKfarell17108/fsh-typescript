# FSH (FK Shell) v2.2.1

> A custom Unix shell built with TypeScript and Node.js, designed for FK Universe to deliver a unique terminal experience.

---

## What is FSH?

**FSH** (FK Shell) is a full-featured Unix shell developed in TypeScript and Node.js. It replaces the default shell (bash/zsh) and provides all standard shell features - pipes, redirection, logical operators, background jobs, and environment variable expansion - while significantly enhancing the user experience through an interactive TUI ecosystem.

FSH operates on the REPL (Read, Evaluate, Print, Loop) model. On top of standard shell behavior, it ships with a visual file browser, a history manager, a trash system, fuzzy search, syntax highlighting, auto-completion, bookmarks, image preview, file operation logging with undo, and more - all built in.

---

## Changelog

### v2.2.1 - Patch

**Source Completion & Smart Startup**

- `source` command Tab completion now specifically suggests `~/.fshrc` for faster config reloading.
- FSH now intelligently detects whether it was launched as a fresh terminal session or invoked from another shell (bash/zsh).
- Fresh terminal launches display `neofetch`; entering FSH from an external shell displays a clean professional banner instead.

---

### v2.2.0 - Minor

**Interactive File Preview (Preview Mode)**

- Text files can now be navigated interactively via `O: Browse` in `ls` and `dir`.
- Preview mode introduces a full cursor that navigates content row by row and column by column.
- Horizontal scrolling with edge-bound clamping is supported.
- Cursor wraps to the next or previous line at line boundaries.

---

### v2.1.10 - Patch

**Preview Navbar & Keybindings**

- When in file preview mode, the navbar is simplified to `Nav: Navigate` and `Esc: Back` for a cleaner interface.
- `PgUp/PgDn` bindings removed from preview mode to prevent unintended jumps; strict cursor navigation applies.

---

### v2.1.9 - Patch

**Media Handling & Sticky Headers**

- File and directory metadata headers in the preview panel are now sticky - they stay visible while scrolling content.
- Selecting a video file now shows a "Video Not Supported" overlay popup instead of opening the editor picker.

---

### v2.1.8 - Patch

**Modal Overlays - Trash Confirmation**

- The trash confirmation dialog in `ls` and `dir` is now a centered overlay popup.
- The background highlights the file or directory being deleted for clear visual context.

---

### v2.1.7 - Patch

**Modal Overlays - Editor Selection**

- The "Choose Editor" prompt is now a centered overlay popup across `ls` and `dir`.

---

### v2.1.6 - Patch

**System & New Builtins**

- `fsh` command added - displays FSH environment info: developer, version, and usage tips.
- `cls` command added as an alias for `clear`.
- Version is now read dynamically from `package.json` across all builtins and terminal outputs.

---

### v2.1.5 - Patch

**Internal Refactoring**

- Improved and standardized the internal reloading logic for `.fshrc` and builtin callback handlers.

---

### v2.1.4 - Patch

**UI Polishing & Neofetch**

- Neofetch UI updated for better aesthetics.
- Navigation labels and `Esc` key logic simplified in browse mode.
- Preview header and metadata visibility improved in the split pane.

---

### v2.1.3 - Patch

**Trash Integration in Fuzzy Search**

- Files and directories can now be moved to trash directly from fuzzy search action panels.
- `D` key in detail view opens a trash confirmation dialog.
- After a successful delete, search results auto-refresh and the deleted item disappears.
- `Esc` in directory action panel now correctly returns to search results instead of closing.
- `Enter` is the consistent key for `cd into` navigation.

---

### v2.1.2 - Patch

**Image Preview with feh & Extended Syntax Highlighting**

- FSH detects image files and opens them in an auto-sized, auto-centered `feh` window.
- `O` on an image in browse mode opens it in `feh`. `Enter` on an image in `ls` does the same.
- Image dimensions are read from raw binary headers (PNG IHDR, JPEG SOF, GIF, BMP DIB).
- `feh` window closes automatically when navigating away or when the browser exits.
- `closeImagePreview()` is called on shell exit and SIGINT to prevent orphaned processes.
- Per-category command coloring for syntax highlighting (editors, git, node, python, system, network, file ops, docker, build tools, shell utils).
- Subcommand coloring for `git`, `npm/npx`, `docker`, and `sudo`-like commands.
- Destructive flag detection (`--force`, `--delete`, `--purge` → red).
- Number argument coloring (orange).
- Path argument coloring by existence and type (dir, hidden dir, file, hidden file, nonexistent).
- Executable cache with 5-second TTL and background refresh.
- Unterminated strings colored amber.

---

### v2.1.1 - Patch

**Fuzzy Search File Preview & Activity Log Category Editor**

- Selecting a file in `search` / `Ctrl+R` now opens an inline file preview with scrollable content.
- Preview shows file metadata and syntax-highlighted content with line numbers.
- `Enter` in file preview opens the editor picker; `Esc` returns to results.
- `Enter` on a category header in the activity log opens a dedicated category editor.
- Category editor supports multi-select (`Space` / `A`) and bulk delete (`X`).
- `D` inside a category editor deletes all entries in that category.
- `Enter` on a command entry in Commands category pastes it to the prompt.
- Multi-item clipboard: `C` and `X` now package all selected items into one clipboard operation.
- Clipboard indicator in the bottom bar shows item count for multi-item selections.
- Error count reported after paste if any item fails; successful items still complete.

---

### v2.1.0 - Feature Update

**Preview Panel, Quick Search, Git Status, Sort, Inline Creation, Bookmarks, Undo, Helps**

- Split preview panel (≥110 columns) and overlay preview panel (<110 columns).
- `P` toggles between split and overlay manually.
- `O` enters browse mode - navigate inside the preview panel without leaving `ls`.
- `PgUp/PgDn` scrolls preview panel content.
- `/` in `ls` or `dir` opens inline recursive fuzzy search (depth 4, max 200 results).
- Bottom bar git badge shows repo name and branch for the folder under the cursor.
- Per-file git status badges: `~` modified, `+` staged, `?` untracked, `-` deleted, `→` renamed, `!` conflict.
- `S` opens a sort picker overlay in `ls`, `dir`, `trash`, and the file ops log.
- `N` creates a new folder inline; `T` creates a new file inline. Cursor jumps to the new item.
- `B` toggles a bookmark on the directory at cursor; `Ctrl+B` opens the bookmark picker.
- Bookmarks persist to `~/.fsh_bookmarks.json`.
- `U` in the file ops log undoes the selected operation (copy → delete copy, move/cut → move back, rename → rename back).
- `helps` command - full keyboard shortcut reference screen.

---

### v2.0.0 - Major Update

**TUI Architecture Overhaul, File Operations System, Persistent Browser, Multi-Select, Activity Log**

- Nano-style navbar across all TUI screens - adaptive 1 or 2 rows, collapses on narrow terminals.
- Persistent bottom status bar on every screen with path, counts, clipboard state, and scroll indicator.
- Consistent layout: navbar → separator → content → bottom bar.
- Fully responsive - all screens recalculate layout on terminal resize.
- Copy (`C`), cut (`X`), paste (`V`), rename (`R`), and move-to (`M`) in `ls` and `dir`.
- Persistent clipboard survives folder navigation.
- File ops log persisted to `~/.fsh_fileops.json` (max 200 entries).
- `H` inside `ls` / `dir` or `Ctrl+H` from prompt opens the file ops log.
- `Enter` on a directory in `ls` navigates into it without exiting the alt screen.
- `Space` toggles selection; `A` selects/deselects all. All operations act on the full selection.
- General activity log for all shell activity: commands, copy, move, rename, trash, restore, delete.
- `Ctrl+H` opens the centralized history panel.

---

### v1.0.0 - Initial Release

- Core shell: pipes, redirection, logical operators, background jobs, env variable expansion.
- Full PTY support for interactive TUI apps (vim, nano, htop, ssh, git, sudo).
- Interactive `ls` with grid layout, color coding, and editor picker.
- Tab completion with visual picker UI.
- Git info in prompt (branch, staged, modified, untracked, ahead/behind).
- Syntax highlighting while typing.
- History manager grouped by time with delete.
- Trash system with preview, restore, and permanent delete.
- `~/.fshrc` config file for aliases and environment variables.
- Neofetch on startup with custom FSH ASCII logo.

---

## Features

### Core Shell

- Run any OS command - `git`, `npm`, `ping`, `curl`, `python`, etc.
- Pipes: `cat file.txt | grep "error" | wc -l`
- Redirection: `echo "log" >> app.log`, `cat < input.txt`, `cmd > out.txt`
- Logical operators: `&&`, `||`, `;`
- Background jobs: `npm run dev &`
- Environment variable expansion: `$HOME`, `$USER`, `$PATH`
- Full PTY support for interactive TUI apps (vim, nano, htop, ssh, git, sudo, etc.)
- `\\` escape and single-quote suppression for variable expansion

---

### Built-in Commands

| Command | Description |
|---|---|
| `ls` | Interactive file browser with grid layout, preview panel, git status, and quick search |
| `dir` | Interactive directory-only browser - identical feature set to `ls` |
| `cd` | Change directory with `~` and `~/path` support |
| `clear` / `cls` | Clear screen and scrollback buffer |
| `alias` | Create, list, or show aliases; no args lists all |
| `unalias` | Remove a defined alias by name |
| `history` | Open general activity log |
| `trash` | Trash manager - browse, preview, restore, delete permanently |
| `search` | Open fuzzy search (same as `Ctrl+R`) |
| `bookmarks` | Open bookmark picker (same as `Ctrl+B`) |
| `fshrc` | Shell config manager (`init`, `reload`, `path`, `version`) |
| `neofetch` | Neofetch manager (`preview`, `on`, `off`) |
| `fsh` | Show FSH environment info: developer, version, tips |
| `source ~/.fshrc` | Re-source the fshrc to apply config changes |
| `helps` | Full keyboard shortcut reference screen |
| `echo` | Print arguments to stdout |
| `pwd` | Print current working directory |
| `type` | Show type of a command (builtin, alias, or path) |
| `exit` | Exit fsh |

---

### Interactive `ls`

Grid layout with color coding, preview panel, and git status. Navigate entirely with the keyboard.

| Key | Action |
|---|---|
| `↑ ↓ ← →` | Navigate grid |
| `Home / End` | Jump to first or last item |
| `Space` | Toggle selection on item at cursor |
| `A` | Select all / deselect all |
| `Enter` (file) | Open with editor picker |
| `Enter` (dir) | Enter directory - stays in browser |
| `Enter` (image) | Open image in feh window |
| `Tab` | Go to parent directory |
| `C` | Copy selected item(s) to clipboard |
| `X` | Cut selected item(s) to clipboard |
| `V` | Paste clipboard into current directory |
| `R` | Rename item at cursor (inline input) |
| `M` | Move mode - navigate to destination, press Y to confirm |
| `D` | Move to trash (preview confirmation popup) |
| `N` | Create new folder (inline input) |
| `T` | Create new file (inline input) |
| `S` | Open sort picker overlay |
| `B` | Toggle bookmark on directory at cursor (gold = bookmarked) |
| `Ctrl+B` | Open bookmark picker |
| `/` | Quick search - recursive fuzzy search through subdirectories |
| `O` (dir/preview) | Enter browse mode inside preview panel |
| `O` (image) | Open image in feh window |
| `O` (text file) | Enter preview mode with full cursor navigation |
| `P` | Toggle split / overlay preview |
| `.` | Toggle hidden files (dotfiles) on / off |
| `PgUp / PgDn` | Scroll preview panel content |
| `H` | Open file operations log |
| `Esc` | Cancel clipboard / clear search / deselect / quit |

---

### Interactive `dir`

Directory-only browser. Identical keyboard layout to `ls` with all features - preview, search, sort, bookmarks, git status - except `T` (new file) is not available.

---

### Preview Panel

Available in both `ls` and `dir`. Automatically switches between split and overlay based on terminal width.

**Split mode** (terminal ≥ 110 columns):

```
┌─ file grid ──────────┬─ preview  ──────────┐
│  src/                │  README.md          │
│  dist/               │  ──────────────     │
│> README.md           │  size      3.2 KB   │
│  package.json        │  modified  Mar 23   │
│                      │  perms     rw-r--r--│
│                      │  ──────────────     │
│                      │  1  # FSH           │
│                      │  2                  │
│                      │  3  > A custom...   │
└──────────────────────┴─────────────────────┘
```

**Overlay mode** (terminal < 110 columns): 12-line preview panel appears above the bottom bar.

**File preview** - syntax-highlighted content with line numbers, sticky metadata header (size, modified, permissions, type).

**Directory preview** - item count, dirs/files breakdown, total size, sorted listing.

**Image preview** - dimensions, size, modified date, and type shown in the panel. Press `O` or `Enter` to open in feh.

**Video selection** - shows "Video Not Supported" overlay popup instead of crashing or corrupting the file.

**Browse mode** (`O`) - navigate inside the preview panel's directory listing with keyboard. `Space` cds into the shown directory.

**Preview mode** (`O` on text) - full cursor navigation inside the file content. Arrow keys move the cursor row/column. Cursor wraps at line boundaries with horizontal scrolling.

---

### Quick Search (`/` in `ls` and `dir`)

| Key | Action |
|---|---|
| `/` | Open search mode |
| Type | Filter results recursively in real time |
| `↑ ↓ ← →` | Navigate filtered results |
| `Enter` | Confirm selection, keep filter active |
| `Esc` | Clear filter and return to normal view |
| `Enter` (dir) | Navigate into it and clear the search |
| `Enter` (file) | Open with editor picker |

Results are scoped to the current directory and all subdirectories (depth 4). Heavy directories - `node_modules`, `.git`, `dist`, `build`, `.next`, `__pycache__` - are automatically excluded. Relative paths are shown so you always know where a result lives. Maximum 200 results.

---

### Clipboard & Multi-Select

`Space` to select items, `A` to select all. `C` and `X` package all selected items into one clipboard operation. `V` pastes all items sequentially. The bottom bar indicator shows the item count for multi-item operations (e.g. `Copy: 4 items`). Error count is reported after paste; successful items still land. The clipboard persists across folder navigation - copy in folder A, navigate, paste in folder B.

---

### Sort Options (`S`)

Press `S` in `ls`, `dir`, `trash`, or the file ops log to open a sort picker overlay. The current sort is shown in the minibar.

| Screen | Sort options |
|---|---|
| `ls` / `dir` | Name A→Z, Name Z→A, Type, Size large/small, Date newest/oldest, Hidden last |
| `trash` | Date newest/oldest, Name A→Z/Z→A, Size large/small, Type dir/file |
| File ops log | Date newest/oldest, Kind A→Z/Z→A, Status done/error |

---

### Git Status (`ls` and `dir`)

**Bottom bar indicator** - shows git info for the folder currently under the cursor. Branch color indicates type: gold for `main`/`master`, cyan for `dev`/`develop`, green for others.

**Per-file badges** in the grid:

| Badge | Color | Meaning |
|---|---|---|
| `~` | Yellow | Modified (unstaged changes) |
| `+` | Green | Staged or added |
| `?` | Orange | Untracked |
| `-` | Red | Deleted |
| `→` | Blue | Renamed |
| `!` | Bright red | Merge conflict |

---

### Inline File & Folder Creation

`N` creates a new folder; `T` creates a new file (ls only). An inline text input appears at the bottom of the screen. Press `Enter` to confirm, `Esc` to cancel. The cursor jumps to the newly created item automatically. Creation is blocked if an item with the same name already exists.

---

### Bookmarks (`B`, `Ctrl+B`, `bookmarks`)

| Key | Action |
|---|---|
| `B` in `ls` / `dir` | Toggle bookmark on directory at cursor (gold = bookmarked) |
| `Ctrl+B` | Open bookmark picker from prompt or inside `ls`/`dir` |
| `bookmarks` command | Same as `Ctrl+B` |
| `Enter` in picker | cd to the bookmarked folder |
| `X` in picker | Remove bookmark |
| `Esc` | Cancel |

Bookmarks persist to `~/.fsh_bookmarks.json`.

---

### Undo File Operations (`U` in file ops log)

Open the file ops log with `H`, navigate to any completed operation, and press `U` to undo it.

| Operation | Undo action |
|---|---|
| Copy | Delete the copy at the destination |
| Move / Cut | Move the item back to its original location |
| Rename | Rename back to the original name |

A `↩` indicator appears next to entries that can be undone. If undo is no longer possible (files were since moved or deleted), a clear message explains why.

---

### Image Preview with feh

Supported formats: `png`, `jpg`, `jpeg`, `gif`, `bmp`, `webp`, `ico`, `tiff`, `tif`.

FSH reads raw image dimensions from binary headers (PNG IHDR, JPEG SOF, GIF logical screen, BMP DIB) and scales the `feh` window to fit the screen, centering it automatically. The `feh` window closes when navigating away or when the browser exits. `Esc` in browse mode while feh is open closes the preview without leaving the browser. `closeImagePreview()` is called on shell exit and SIGINT to ensure no orphaned feh processes remain.

---

### Trash System (`trash`)

| Key | Action |
|---|---|
| `↑ ↓` | Navigate |
| `Space` | Select / deselect item |
| `A` | Select all |
| `Enter` | Preview file or directory contents |
| `O` (in preview) | Browse directory listing of a trashed folder |
| `R` | Restore to original location |
| `X` | Delete forever (with confirmation) |
| `D` | Empty entire trash (with confirmation) |
| `S` | Change sort order |
| `Esc` | Deselect / quit |

If the original path is already taken when restoring, FSH renames the restored item as `filename(restored)`.

---

### Activity Log (`history` / `Ctrl+H`)

Centralized log of all shell activity, persisted to `~/.fsh_general_history.json`.

| Category | What is logged |
|---|---|
| Commands | Every command executed from the prompt |
| File & Folder Mutations | Copy, move, rename operations |
| Trash Operations | Trash, restore, delete, empty trash |

Press `Enter` on a category header to open the **category editor**:
- Navigate, select, and bulk-delete entries within that category.
- `Enter` on a command entry pastes it to the prompt and executes it.
- `Enter` on a non-command entry opens its detail view.
- `D` deletes all entries in the category.
- `Esc` returns to the main activity log without losing scroll position.

---

### File Operations Log (`H` inside `ls` or `dir`)

Every copy, cut, move, and rename is logged with:

| Field | Description |
|---|---|
| ID | Unique identifier |
| From | Source path |
| To | Destination path |
| Timestamp | Date and time |
| Status | `✓` done, `✗` error, `…` pending |

Press `Enter` on any entry for full detail. Press `U` to undo. Persisted to `~/.fsh_fileops.json` (max 200 entries).

---

### Fuzzy Search (`search` / `Ctrl+R`)

Full-screen search across all sources simultaneously.

| Key | Action |
|---|---|
| Type | Filter results in real time |
| `↑ ↓` | Navigate results (skips headers) |
| `Enter` (command) | Paste command / builtin / alias / executable to prompt |
| `Enter` (directory) | Open directory action panel - cd into or delete |
| `Enter` (file) | Open inline file preview with scrollable content |
| `↑ ↓ / PgUp/PgDn` | Scroll file preview content |
| `Enter` (file preview) | Open editor picker |
| `← →` | Navigate editor choices |
| `D` (in detail view) | Move file or directory to trash |
| `Esc` (detail view) | Back to search results |
| `Esc` (search) | Cancel and exit |

Sources searched: command history, directories, files, builtins, aliases, executables.

---

### Command History Picker (Tab on empty line)

Visual history picker grouped by time: Last hour, Today, Yesterday, This week, Older.

| Key | Action |
|---|---|
| `↑ ↓` | Navigate entries and group headers |
| `Space` | Select / deselect entry |
| `A` | Select all / deselect all |
| `Enter` | Use command immediately |
| `X` / `Delete` | Delete selected entries or entire group |
| `D` | Delete all history (with confirmation) |
| `Esc` | Deselect / close |

History is persisted to `~/.fsh_history` (max 500 unique commands).

---

### Tab Completion

- Single match → auto-complete inline.
- Common prefix → extend input to the longest shared prefix.
- Multiple matches → interactive picker UI (same grid style as `ls`).
- Completes commands, file paths, aliases, and fshrc/neofetch subcommands.
- `Tab` after `source` specifically suggests `~/.fshrc`.
- `Tab` on an empty line opens the command history picker.
- `Tab` inside the completion picker switches to the history picker.

---

### Git Info in Prompt

```
fsh/fsh-typescript (main ●↑2) >
```

| Indicator | Meaning |
|---|---|
| `●` | Staged changes |
| `✚` | Modified files |
| `…` | Untracked files |
| `↑N` | N commits ahead of remote |
| `↓N` | N commits behind remote |

---

### Syntax Highlight While Typing

Commands are colored by category. Path arguments are colored by whether the path exists and what type it is.

| Token | Color | Examples |
|---|---|---|
| Builtin / valid command | Bright green | `ls`, `cd`, `clear` |
| Alias | Light green | any defined alias |
| Invalid command | Red | anything not found in PATH |
| Editor | Purple | `vim`, `nvim`, `nano`, `code` |
| Git tools | Orange | `git`, `gh` |
| Node / npm | Teal | `node`, `npm`, `npx`, `yarn` |
| Python tools | Gold | `python`, `pip` |
| System / sudo | Red-pink | `sudo`, `kill`, `apt` |
| Network tools | Light blue | `curl`, `ssh`, `ping` |
| File operations | Light green | `cp`, `mv`, `grep`, `find` |
| Docker / k8s | Sky blue | `docker`, `kubectl` |
| Build tools | Yellow | `make`, `tsc`, `cargo` |
| Shell utils | Blue-grey | `bash`, `env`, `man` |
| Subcommand | Semantic | `git add` → green, `git reset` → red |
| Flags (`-v`, `--help`) | Yellow / Light blue | varies by flag name |
| Destructive flags | Red | `--force`, `--delete`, `-f` |
| Operators (`\|`, `&&`) | Cyan | `\|`, `&&`, `\|\|` |
| Redirects (`>`, `>>`) | Orange | `>`, `>>`, `<` |
| Double-quoted strings | Orange-gold | `"hello"` |
| Single-quoted strings | Light green | `'hello'` |
| Incomplete strings | Amber | unterminated `"` or `'` |
| Variables (`$HOME`) | Magenta | `$HOME`, `$USER`, `$PATH` |
| Numeric arguments | Orange | `5`, `1234`, `3.14` |
| Existing directory arg | Blue | `./src`, `~/projects` |
| Existing file arg | White | `./README.md` |
| Non-existent path arg | Dim red | `./missing` |

---

### Helps Screen (`helps`)

Full keyboard shortcut reference covering every feature in FSH.

| Key | Action |
|---|---|
| `↑ ↓` / `j` / `k` | Scroll one line |
| `PgUp / PgDn` | Fast scroll |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `Esc` / `q` | Close |

---

### Startup Behavior

| Scenario | What happens |
|---|---|
| Fresh terminal launch | Displays neofetch with custom FSH ASCII logo (if enabled) |
| Launched from bash/zsh | Displays a clean professional banner instead |
| `neofetch on` | Enable neofetch on every fresh terminal startup |
| `neofetch off` | Disable neofetch on startup |
| `neofetch preview` | Preview neofetch output without changing the setting |

Neofetch shows: OS, kernel, shell version, CPU, RAM, disk, uptime, IP, and terminal color palette.

---

### Config File (`~/.fshrc`)

```bash
# Aliases
alias ll='ls -la'
alias gs='git status'
alias ..='cd ..'

# Environment variables
export EDITOR=nano
export NODE_ENV=development
```

Run `fshrc reload` to hot-reload config without restarting the shell. All modules (aliases, env vars, bookmarks, file ops log, general history) refresh in place.

---

## TUI Layout

All interactive screens share the same structure:

```
┌─────────────────────────────────────────────────────────────────┐
│  Nav Navigate   Spc Select   A All   Ent Open   Tab Parent  ... │  ← navbar row 1
│  C Copy   X Cut   V Paste   R Rename   M Move   D Delete    ... │  ← navbar row 2
│  ─────────────────────────────────────────────────────────────  │  ← separator
│                                                                 │
│  [content area]                           [preview panel]       │
│                                                                 │
│  [N] Folder  [T] File  [S] Sort  [B] Bookmark  [/] Search       │  ← minibar
│  ~/projects/fsh  3d  12f  git: fsh (main)         ↓ 8 more      │  ← bottom bar
└─────────────────────────────────────────────────────────────────┘
```

The navbar adapts: 1 row when ≤ 7 shortcuts fit, 2 rows otherwise. It collapses to shorter labels on narrow terminals. The bottom bar shows the git status indicator for the folder under the cursor. The minibar shows quick-access shortcuts for creation, sort, bookmarks, and search.

---

## Comparison with bash/zsh

| Feature | bash/zsh | fsh |
|---|---|---|
| Interactive file browser | ❌ | ✅ Grid with colors, preview, search |
| Tab completion UI | Basic list | ✅ Visual picker |
| Delete to trash | ❌ | ✅ From ls, dir, search, and trash |
| Git info in prompt | Plugin needed | ✅ Built-in |
| Git status in file browser | ❌ | ✅ Per-file badges + bottom bar |
| File preview panel | ❌ | ✅ Split + overlay, sticky headers |
| Interactive file preview mode | ❌ | ✅ Full cursor navigation |
| Image preview with feh | ❌ | ✅ Auto-sized, auto-centered |
| Quick search in browser | ❌ | ✅ `/` recursive fuzzy search |
| Syntax highlight while typing | Plugin needed | ✅ Built-in, per-category colors |
| History manager UI | ❌ | ✅ Grouped by time |
| Custom neofetch | ❌ | ✅ Built-in, environment-aware |
| Nano-style keyboard navigation | ❌ | ✅ All TUI screens |
| Persistent bottom status bar | ❌ | ✅ Path + git + scroll info |
| Show / hide hidden files | ❌ | ✅ Press `.` in ls / dir |
| In-shell copy / cut / paste | ❌ | ✅ Multi-item persistent clipboard |
| File operations log | ❌ | ✅ Tracked with id + timestamp |
| Undo file operations | ❌ | ✅ Move back, rename back, delete copy |
| Sort options in browser | ❌ | ✅ Name, type, size, date, hidden last |
| Create files/folders inline | ❌ | ✅ `N` and `T` with inline input |
| Pinned/bookmark directories | ❌ | ✅ Gold color + persistent |
| Centralized activity log | ❌ | ✅ Commands + file ops + trash |
| Activity log category editor | ❌ | ✅ Per-category edit, bulk delete |
| Fuzzy search file preview | ❌ | ✅ Inline scroll + editor picker |
| Fuzzy search across all sources | ❌ | ✅ `Ctrl+R` |
| Multi-select for bulk operations | ❌ | ✅ `Space` + `A` |
| Persistent browser (no exit on Enter) | ❌ | ✅ Navigate without leaving ls |
| Keyboard shortcut reference | ❌ | ✅ `helps` command |

---

## Setup

### Prerequisites

- Node.js v16+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- npm
- Linux / WSL Ubuntu

### Install

```bash
git clone https://github.com/FKfarell17108/fsh-typescript.git
cd fsh-typescript
npm install
npm run build
```

### Set as Default Shell

Create the launcher script:

```bash
sudo nano /usr/local/bin/fsh
```

Paste this content:

```bash
#!/bin/bash

if [[ ! -t 0 ]] || \
   [[ -n "$VSCODE_AGENT_FOLDER" ]] || \
   [[ -n "$VSCODE_IPC_HOOK_CLI" ]] || \
   [[ -n "$VSCODE_HANDLES_SIGPIPE" ]]; then
  exec /bin/bash "$@"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
exec node /home/farell/projects/shell/fsh-typescript/dist/main.js "$@"
```

Make it executable, register it, and set as default:

```bash
sudo chmod +x /usr/local/bin/fsh
echo "/usr/local/bin/fsh" | sudo tee -a /etc/shells
chsh -s /usr/local/bin/fsh
```

Restart your terminal.

### Update After Code Changes

```bash
cd ~/path/to/fsh-typescript
npm run build
# Restart terminal - changes apply immediately
```

---

## Data Files

| File | Contents | Max entries |
|---|---|---|
| `~/.fsh_history` | Command history | 500 |
| `~/.fsh_general_history.json` | All activity: commands, file ops, trash | 500 |
| `~/.fsh_fileops.json` | File operation log: copy, move, rename | 200 |
| `~/.fsh_trash/` | Trashed files | - |
| `~/.fsh_trash/.meta.json` | Trash metadata: original paths, timestamps | - |
| `~/.fsh_bookmarks.json` | Saved bookmark directories | - |
| `~/.fshrc` | Shell config: aliases, env vars | - |
| `~/.fsh_neofetch` | Neofetch on/off startup state | - |

---

## FK Universe Standard Compliance

FSH has been developed in alignment with the FK Universe Standard, emphasizing consistency, usability, modular engineering, maintainability, and a unified terminal experience across future FK Universe projects.

This standard reflects the long-term engineering direction of the FK Universe ecosystem.

---

## License

Copyright © 2026 Farell Kurniawan

FSH is released under the Apache License 2.0.  
See the LICENSE file for full terms.

Unless required by applicable law or agreed to in writing, the software is distributed on an "AS IS" BASIS, without warranties or conditions of any kind.

---

## Trademark Notice

“FSH”, “FK Shell”, and related branding elements may be trademarks of Farell Kurniawan / FK Universe.  
Unauthorized use of the project identity, branding, or misleading forks may be restricted separately from the open-source code license.
