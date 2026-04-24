# FSH (FK Shell) v2.2.1

> A custom Unix shell, developed using TypeScript, and designed specifically for FK Universe to deliver a unique terminal experience.

---

## What is fsh?

**FSH** (FK Shell) is a full-featured Unix shell developed using TypeScript and Node.js. FSH replaces the default shell (bash/zsh) and provides all standard shell features, such as executing commands, piping, and redirection.

**Shell** is a program that interprets what we type in the terminal. It operates using the REPL (Read, Evaluate, Print, Loop) model. FSH is capable of doing all of that, while significantly enhancing the user experience to meet the specific needs of the FK Universe - an interactive terminal, a history manager, a trash system, an auto-completion system, and much more.

---

## Changelog

### v2.2.1 - Patch

#### Source Completion & Smart Startup
- **`source` Command Completion** - Pressing `Tab` after typing `source` now specifically suggests `~/.fshrc` for faster configuration reloading.
- **Environment-Aware Startup** - `fsh` now intelligently distinguishes between a fresh terminal launch and being called from another shell (like `bash`/`zsh`).
- **Startup Visuals** - Primary terminal launches show `neofetch`, while entering `fsh` from an external shell displays a clean, professional banner.


### v2.2.0 - Minor

#### Interactive File Preview
- **Editor-like Cursor Navigation** - Text files can now be interactively previewed (`O: Browse`) in `ls` and `dir`. Entering preview mode introduces a cursor that can navigate the content with full line wrapping and edge-bound horizontal scrolling.

---

### v2.1.10 - Patch

#### Preview Navbar & Keybindings
- **Simplified Navbar** - When navigating within a file preview, the navbar is simplified (`Nav: Navigate` and `Esc: Back`) for a cleaner interface.
- **Removed Scrolling Overlaps** - `PgUp/PgDn` bindings have been removed from the preview mode to prevent unintended leaps, prioritizing strict cursor-based navigation.

---

### v2.1.9 - Patch

#### Media Handling & Sticky Headers
- **Sticky Preview Headers** - The file and directory metadata headers in the preview panel are now fixed ("sticky") at the top, preventing metadata from disappearing when scrolling.
- **Video Media Handling** - Selecting a video file now triggers a "Video Not Supported" overlay popup instead of opening the generic editor picker, avoiding file corruption.

---

### v2.1.8 - Patch

#### Modal Overlays: Trash Confirmation
- **Centered Trash Overlay** - The confirmation dialog for moving items to the trash in `ls` and `dir` is now presented as a clean, centered overlay popup instead of a bottom prompt.
- **Trash Preview Context** - When confirming a deletion, the background now clearly highlights the file or directory being deleted to provide better visual context.

---

### v2.1.7 - Patch

#### Modal Overlays: Editor Selection
- **Centered Editor Picker** - The "Choose Editor" prompt is now presented as a centered overlay popup across the filesystem browsers (`ls` and `dir`).

---

### v2.1.6 - Patch

#### System & New Builtins
- **`fsh` Command** - Added a new builtin command that displays general information about the FSH (FK Shell) environment.
- **`cls` Command** - Added as an alias command for `clear` to quickly clear the terminal screen.
- **Dynamic Versioning** - Version parsing is now dynamic, reading directly from `package.json` for builtins and terminal outputs.

---

### v2.1.5 - Patch

#### Internal Refactoring
- **`fshrc` Reloading Refactor** - Improved and standardized the internal reloading logic for `.fshrc` and builtin callback handlers to ensure smoother updates.

---

### v2.1.4 - Patch

#### UI Polishing & Neofetch
- **Neofetch Enhancements** - Modified the builtin `neofetch` UI for better aesthetics.
- **Navigation Labels** - Simplified navigation labels and `Esc` key logic in browse mode.
- **Header Visibility** - Improved preview header and metadata visibility in the split pane.

---

### v2.1.3 - Patch

#### Trash Integration in Fuzzy Search
- **Dedicated Delete Action** - Files and directories can now be moved to trash directly from the action panels in `search` / `Ctrl+R`
- **`D` key in Detail View** - Pressing `D` while viewing a file preview or directory listing inside search opens a confirmation dialog to move the item to trash
- **Auto-Refresh Search** - After a successful delete operation, the search results are automatically refreshed and the deleted item is removed from the list
- **Refined Directory Navigation**:
  - **`Esc`** in directory action panel now correctly returns to the main search results instead of closing the search
  - **`Enter`** is now the primary and consistent key for `cd into` navigation
  - Navigation labels updated in the navbar for better clarity (`cd into` vs `Back`)

---

### v2.1.2 - Patch

#### Image Preview with feh
- **Image detection** - FSH detects image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.ico`, `.tiff`, `.tif`) in both `ls` and `dir`
- **`O`** on an image file in browse mode opens it in an external `feh` window with automatic sizing and centering
- **`Enter`** on an image file in `ls` opens it directly with `feh` instead of the editor picker
- FSH reads raw image dimensions from binary headers (PNG IHDR, JPEG SOF, GIF logical screen, BMP DIB) and scales the `feh` window to fit the screen, centering it automatically
- Preview panel shows image metadata: dimensions (`width×height`), file size, modified date, permissions, and file type
- `feh` window is automatically closed when navigating away from the image or when the browser exits
- **`Esc`** in browse mode while a `feh` window is open closes the preview without leaving the browser
- `closeImagePreview()` is called on shell exit and SIGINT to ensure no orphaned `feh` processes remain

#### Extended Syntax Highlighting
- **Per-category command coloring** - commands are now colored based on their category rather than a single green color:

| Category | Color | Examples |
|---|---|---|
| Builtins / Aliases | Bright green / Light green | `ls`, `cd`, `clear` |
| Editors | Purple | `vim`, `nvim`, `nano`, `code` |
| Git tools | Orange | `git`, `gh`, `hub` |
| Node / npm | Teal | `node`, `npm`, `npx`, `yarn`, `bun` |
| Python | Gold | `python`, `pip`, `poetry` |
| System | Red-pink | `sudo`, `systemctl`, `apt`, `kill` |
| Network | Light blue | `curl`, `wget`, `ssh`, `ping` |
| File ops | Light green | `cp`, `mv`, `rm`, `grep`, `find` |
| Docker / k8s | Sky blue | `docker`, `kubectl`, `helm` |
| Build tools | Yellow | `make`, `gcc`, `tsc`, `cargo` |
| Shell utils | Blue-grey | `bash`, `env`, `which`, `man` |

- **Subcommand coloring** - first argument after `git`, `npm`/`npx`, `docker`, and `sudo`-like commands gets semantic coloring:
  - `git add / commit / push / tag` → green; `git reset / rm / clean` → red; others → gold
  - `npm install / ci` → teal; `npm uninstall` → red; `npm run / start` → green
  - `docker run / build / start` → green; `docker rm / rmi / stop` → red; others → sky blue
  - Arguments after `sudo` / `su` / `doas` → red
- **Destructive flag detection** - flags containing `force`, `hard`, `delete`, `remove`, `purge`, `nuke` are colored red; `help`, `version`, `verbose`, `dry-run` are light blue; `output`, `format`, `config`, `file` flags are orange
- **Number argument coloring** - standalone numeric arguments are colored orange (e.g. `sleep 5`, `kill -9 1234`)
- **Path argument coloring** - arguments that resolve to real paths are colored by type:
  - Existing directory → light blue; hidden directory → dim blue
  - Existing file → white / dim for hidden files
  - Non-existent path → dim red
- **Executable cache** - PATH executables are cached for 5 seconds with background refresh to keep highlighting fast without blocking input
- **Incomplete string detection** - unterminated `"` or `'` strings are colored amber instead of the normal string color

---

### v2.1.1 - Patch

#### Fuzzy Search File Preview
- **Selecting a file** in `search` / `Ctrl+R` now opens an inline file preview instead of immediately launching an editor
- Preview shows file metadata (size, modified date, file type) followed by syntax-highlighted content with line numbers
- **`↑↓` / `PgUp`/`PgDn`** scrolls the file content inside the preview
- **`Enter`** opens the editor picker when viewing a file — choose from all installed editors
- **`←→`** navigates between editor choices in the picker row
- **`Esc`** returns to the search results without opening anything
- Directory results still open a folder preview showing children before `cd`-ing in

#### Activity Log Category Editor
- **`Enter` on a category header** in the activity log now opens a dedicated category editor screen for Commands, File & Folder Mutations, or Trash Operations
- Category editor supports **multi-select** (`Space` / `A`) and **bulk delete** (`X`)
- **`D`** inside a category editor deletes all entries in that category at once (with no confirmation — matches the history manager behavior)
- **`Enter` on a command entry** in the Commands category pastes it directly to the prompt (same as the history manager)
- **`Enter` on a non-command entry** opens the detail view for that entry
- Back navigation returns to the main activity log without losing scroll position

#### Multi-item Clipboard
- Copy (`C`) and cut (`X`) in `ls` and `dir` now package all **selected items** into a single clipboard operation
- Clipboard stores an `items[]` array; paste (`V`) iterates over all items and executes each copy/move in sequence
- The clipboard indicator in the bottom bar shows the item count when multiple items are selected (e.g. `Copy: 4 items`)
- Error count is reported after paste if any individual item fails; successful items still complete

---

### v2.1.0 - Feature Update

#### Preview Panel (`ls` and `dir`)
- **Split preview** - when the terminal is wide enough (≥ 110 columns), a preview panel appears on the right side of the file grid, occupying 40% of the width
- **Overlay preview** - on narrower terminals, a 12-line preview panel appears above the bottom bar
- **`P`** toggles between split and overlay mode manually
- **`O`** enters browse mode - navigate inside the preview panel with arrow keys, drill into subdirectories without leaving `ls`
- **`PgUp` / `PgDn`** scrolls the preview panel content
- File preview shows syntax-colored content with line numbers, file size, modified date, and permissions
- Directory preview shows item count, dirs/files breakdown, total size, and a sorted listing

#### Quick Search (`/` in `ls` and `dir`)
- Press `/` to open inline search mode - the bottom bar transforms into a live search input
- Search is **recursive** - scans all subdirectories of the current folder up to 4 levels deep
- Skips heavy directories automatically: `node_modules`, `.git`, `dist`, `build`, `.next`, `__pycache__`
- Results show the **relative path** from the current directory so you always know where a file lives
- Arrow keys still navigate the filtered grid while search mode is active
- `Esc` clears the query and returns to normal view; `Enter` confirms and closes the search bar while keeping the filter active
- Active query shown in bottom bar as `/query`
- Max 200 results to keep performance snappy

#### Git Status Indicator
- **Bottom bar git badge** - the bottom bar of `ls` and `dir` now shows the git status of the folder currently under the cursor
  - `git: repo-name (branch)` in green when the folder is inside a git repo
  - `no git` in red when the folder has no git history
- Moves with the cursor in real time as you navigate the grid
- **Per-file git status badges** - every file and folder in the grid gets a 1-character badge showing its git status:

| Badge | Color | Meaning |
|---|---|---|
| `~` | Yellow | Modified (unstaged changes) |
| `+` | Green | Staged / added |
| `?` | Orange | Untracked |
| `-` | Red | Deleted |
| `→` | Blue | Renamed |
| `!` | Bright red | Merge conflict |

#### Sort Options
- Press `S` inside `ls`, `dir`, or `trash` to open a sort picker overlay
- **`ls` / `dir` sort options:** Name A→Z, Name Z→A, Type, Size large, Size small, Date newest, Date oldest, Hidden last
- **`trash` sort options:** Date newest/oldest, Name A→Z/Z→A, Size large/small, Type dir/file
- **File ops log sort options:** Date newest/oldest, Kind A→Z/Z→A, Status done/error
- Current sort shown in the minibar as `Sort: Type A>Z`

#### Inline File Creation (`n`, `t` in `ls` and `dir`)
- **`N`** - create a new folder inline: a text input appears at the bottom, type the name and press `Enter`
- **`T`** - create a new file inline, same flow
- Both confirm with `Enter`, cancel with `Esc`
- The cursor jumps to the newly created item after creation

#### Bookmarks / Pinned Directories
- **`B`** inside `ls` or `dir` - toggle a bookmark on the directory at cursor; bookmarked folders appear in **gold**
- **`Ctrl+B`** from the prompt or inside `ls`/`dir` - open the bookmark picker to jump to any saved folder
- **`bookmarks`** command - same as `Ctrl+B`
- Bookmarks persist across sessions in `~/.fsh_bookmarks.json`
- Remove a bookmark by pressing `X` in the bookmark picker

#### Undo for File Operations
- **`U`** inside the file operations log - undo the selected operation
  - Copy → delete the copy
  - Move / Cut → move back to original location
  - Rename → rename back to original name
- Undo availability is shown with a `↩` indicator and `↩ undo available` message in the detail view
- If undo is no longer possible (files moved or deleted), a clear error is shown

#### Helps Screen
- **`helps`** command - opens a full reference screen with every keyboard shortcut in FSH organized by category
- Navigate with `↑↓` or `j`/`k`; `PgUp`/`PgDn` for fast scroll; `g`/`G` for top/bottom
- Categories: Shell Core, Built-in Commands, Prompt Shortcuts, ls/dir Browser, Trash Manager, Activity Log, File Operations Log, Fuzzy Search, Bookmarks, Git Prompt, Syntax Highlight Colors, Config File, Data Files

---

### v2.0.0 - Major Update

#### TUI Architecture Overhaul
- **Nano-style navbar** - all interactive screens display a fixed navbar at the top with keyboard shortcuts. Adaptive: 1 row when shortcuts are 7 or fewer, 2 rows when more are needed. Auto-collapses to shorter hint strings when the terminal is narrow
- **Bottom status bar** - every screen shows a persistent bottom bar with context info (path, counts, clipboard state) on the left and a scroll indicator (`↓ 12 more` / `end`) on the right
- **Consistent layout across all screens** - `ls`, `dir`, `trash`, `history`, `search`, `completion picker`, `file ops log`, and `activity log` all share the same layout: navbar → separator → content → bottom bar
- **Fully responsive** - all screens recalculate layout on terminal resize, both while active and after returning from a sub-screen
- `drawNavbar(hints[], right?)` - adaptive tier system: picks the longest hint string that fits, automatically falls back to shorter versions as the terminal narrows; 2-row mode activates when no single row fits, split at the midpoint
- `drawFooter(footerRow, total, scrollTop, vis, statLeft?)` - two-zone footer: left = statistics (e.g. `3 dirs  12 files`), right = `↓ N more` or `(end)`
- `getNR()` - dynamic navbar height so all position calculations use it instead of a hardcoded constant
- `exitAlt()` - no longer sends extra `\r\n`, fixing the prompt appearing on the wrong line after leaving any interactive UI

#### File Operations System (new)
- **Copy / Cut / Paste** - `c` copy, `x` cut, `v` paste, available in both `ls` and `dir`
- **Rename** - `r` renames inline with a text input at the bottom
- **Move To** - `m` moves selected items to any path you specify
- **Persistent clipboard** - copy in folder A, navigate into any subdirectory, paste in folder B; clipboard stays active across navigation
- **Clipboard indicator** - bottom bar shows the active clipboard item; `Esc` cancels clipboard without quitting
- **File ops log** - every copy, cut, move, and rename is tracked with a unique id, source path, destination path, timestamp, and status (`✓` / `✗` / `…`). Persisted to `~/.fsh_fileops.json` (max 200 entries)
- **Log panel** - `h` inside `ls` / `dir`, or `Ctrl+H` from the prompt, opens the log panel. Press `Enter` on any entry for full detail view

#### Persistent Browser in ls
- `Enter` on a directory navigates into it without exiting the alt screen
- `Tab` goes up to the parent directory
- Clipboard and multi-selection persist across folder navigation

#### Multi-Select (ls, dir, trash)
- `Space` toggles selection on the item at cursor
- `a` selects all / deselects all
- All operations act on the full selection at once
- Selected items shown with `✓` prefix in magenta

#### General Activity Log (new)
- Centralized log for all shell activity: commands, copy, move, rename, trash, restore, delete
- `Ctrl+H` from the prompt opens the general history panel
- Three categories: **Commands**, **File & Folder Mutations**, **Trash Operations**

#### History Manager
- Multi-select, grouped by time, delete per entry or all
- `Enter` immediately pastes the command to the prompt

#### Fuzzy Search (`Ctrl+R`)
- Searches command history, filesystem, builtins, aliases, and executables simultaneously
- Results categorized by type

#### Show / Hide Hidden Files
- Press `.` inside `ls` or `dir` to toggle dotfiles

---

### v1.0.0 - Initial Release

- Core shell: pipes, redirection, logical operators, background jobs, env variable expansion
- Full PTY support for interactive TUI apps (vim, nano, htop, ssh, git, sudo)
- Interactive `ls` with grid layout, color coding, and editor picker
- Tab completion with visual picker UI
- Git info in prompt (branch, staged, modified, untracked, ahead/behind)
- Syntax highlighting while typing
- History manager grouped by time with delete
- Trash system with preview, restore, and permanent delete
- `~/.fshrc` config file for aliases and environment variables
- Neofetch on startup with custom FSH ASCII logo

---

## Features

### Core Shell
- Run any OS command (`git`, `npm`, `ping`, `curl`, etc.)
- Pipes: `cat file.txt | grep "error" | wc -l`
- Redirection: `echo "log" >> app.log`, `cat < input.txt`
- Logical operators: `&&`, `||`, `;`
- Background jobs: `npm run dev &`
- Environment variable expansion: `$HOME`, `$USER`
- Full PTY support for interactive TUI apps (vim, nano, htop, ssh, git, sudo, etc.)

### Built-in Commands

| Command | Description |
|---|---|
| `ls` | Interactive file browser with grid layout, preview, and search |
| `dir` | Interactive directory-only browser with preview and search |
| `cd` | Change directory with `~` support |
| `clear` | Clear screen and scrollback buffer |
| `alias` | Create / list / remove aliases |
| `history` | Visual history manager |
| `trash` | Move files to trash, restore, or delete permanently |
| `bookmarks` | Open bookmark picker to jump to a saved directory |
| `fshrc` | Manage shell config file |
| `neofetch` | Display system info on startup |
| `helps` | Full keyboard shortcut reference screen |

### Interactive `ls`

Grid layout with color coding, preview panel, and git status. Navigate entirely with the keyboard.

| Key | Action |
|---|---|
| `↑↓←→` | Navigate grid |
| `Space` | Select / deselect item |
| `a` | Select all / deselect all |
| `Enter` | Open file (editor picker) or enter directory |
| `Tab` | Go to parent directory |
| `c` | Copy selected item(s) to clipboard |
| `x` | Cut selected item(s) to clipboard |
| `v` | Paste clipboard contents to current directory |
| `r` | Rename selected item |
| `m` | Move selected item(s) to a specified path |
| `d` | Move to trash (with preview confirmation) |
| `n` | Create new folder (inline input) |
| `t` | Create new file (inline input) |
| `s` | Change sort order |
| `b` | Toggle bookmark on directory at cursor |
| `Ctrl+B` | Open bookmark picker |
| `/` | Quick search (recursive, fuzzy) |
| `o` | Enter browse mode in preview panel / open image with feh |
| `p` | Toggle split / overlay preview |
| `PgUp / PgDn` | Scroll preview panel |
| `.` | Toggle hidden files on / off |
| `h` | Open file operations log |
| `Esc` | Cancel clipboard / clear search / deselect / quit |

### Interactive `dir`

Directory-only browser. Identical keyboard layout to `ls` with all features available including preview, search, sort, bookmarks, and git status.

### Preview Panel

Available in both `ls` and `dir`. Automatically switches between split and overlay based on terminal width.

**Split mode** (terminal ≥ 110 columns):
```
┌─ file grid ──────────┬─ preview ──────────┐
│  src/                │    4 items          │
│  dist/               │  ──────────────     │
│▶ README.md           │  size      3.2 KB   │
│  package.json        │  modified  Mar 23   │
│                      │  perms     rw-r--r--│
│                      │  ──────────────     │
│                      │  1  # FSH           │
│                      │  2                  │
│                      │  3  > A custom...   │
└──────────────────────┴─────────────────────┘
```

**Image preview**: selecting an image file shows its dimensions and metadata in the preview panel, and pressing `O` or `Enter` opens it in a `feh` window.

**Browse mode** (`O`): navigate inside the preview panel's directory listing without entering it in the main grid.

### Quick Search (`/` in `ls` and `dir`)

| Key | Action |
|---|---|
| `/` | Open search mode |
| Type | Filter results recursively in real time |
| `↑↓←→` | Navigate filtered results |
| `Enter` | Confirm selection, keep filter active |
| `Esc` | Clear filter and return to normal view |
| `Enter` on a dir | Navigate into it and clear the search |
| `Enter` on a file | Open with editor picker |

Results are scoped to the current directory and all subdirectories (depth 4). Heavy directories like `node_modules` and `dist` are automatically excluded. Relative paths are shown in the grid so you always know where a result lives.

### Git Status (`ls` and `dir`)

**Bottom bar indicator** - shows git info for the folder currently under the cursor:
- `git: fsh-universe (main)` - green, when inside a git repo
- `no git` - red, when not a git repository

**Per-file badges** in the grid:

| Badge | Meaning |
|---|---|
| `~` | Modified (unstaged) |
| `+` | Staged or added |
| `?` | Untracked |
| `-` | Deleted |
| `→` | Renamed |
| `!` | Merge conflict |

### Sort Options (`s`)

Press `s` in `ls`, `dir`, `trash`, or the file ops log to open a sort picker overlay. The current sort is shown in the minibar.

| Screen | Sort options |
|---|---|
| `ls` / `dir` | Name A→Z, Name Z→A, Type, Size large/small, Date newest/oldest, Hidden last |
| `trash` | Date newest/oldest, Name A→Z/Z→A, Size large/small, Type dir/file |
| File ops log | Date newest/oldest, Kind A→Z/Z→A, Status done/error |

### Bookmarks (`b`, `Ctrl+B`, `bookmarks`)

| Key | Action |
|---|---|
| `b` in `ls` / `dir` | Toggle bookmark on directory at cursor (gold = bookmarked) |
| `Ctrl+B` | Open bookmark picker from prompt or inside `ls`/`dir` |
| `Enter` in picker | `cd` to the bookmarked folder |
| `X` in picker | Remove bookmark |
| `Esc` | Cancel |

Bookmarks persist to `~/.fsh_bookmarks.json`.

### Undo for File Operations (`u` in file ops log)

Open the file ops log with `h`, navigate to any completed operation, and press `U` to undo it.

| Operation | Undo action |
|---|---|
| Copy | Delete the copy at the destination |
| Move / Cut | Move the item back to its original location |
| Rename | Rename back to the original name |

A `↩` indicator appears next to entries that can be undone. If undo is no longer possible (files were since moved or deleted), a clear message explains why.

### Helps Screen (`helps`)

Full keyboard shortcut reference covering every feature in FSH. Navigate with `↑↓`, `j`/`k`, `PgUp`/`PgDn`, `g`/`G`. Press `Esc` or `q` to close.

### Tab Completion

- Single match → auto-complete inline
- Multiple matches → interactive picker UI (same grid style as `ls`)
- Completes commands, filenames, paths, and aliases
- `Tab` on an empty line → browse command history picker

### Git Info in Prompt

```
fsh/fsh-universe (main ●↑2) >
```

| Indicator | Meaning |
|---|---|
| `●` | Staged changes |
| `✚` | Modified files |
| `…` | Untracked files |
| `↑N` | N commits ahead of remote |
| `↓N` | N commits behind remote |

### Syntax Highlight While Typing

Commands are colored by category. The table below shows the full color scheme:

| Token | Color | Examples |
|---|---|---|
| Builtin / valid command | Bright green | `ls`, `cd`, `clear` |
| Alias | Light green | any defined alias |
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
| Invalid command | Red | anything not found |
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
| Path arguments | Blue / White / Red | based on whether path exists |

### History Manager (`history`)

| Key | Action |
|---|---|
| `↑↓` | Navigate |
| `Space` | Select / deselect entry |
| `a` | Select all / deselect all |
| `Enter` | Use command immediately |
| `d` | Delete selected entries or group at cursor |
| `D` | Delete all history (with confirmation) |
| `Esc` | Deselect / close |

History is grouped by time: Last hour, Today, Yesterday, This week, Older. Persisted to `~/.fsh_history`.

### Fuzzy Search (`Ctrl+R`)

Full-screen search across all sources simultaneously.

| Key | Action |
|---|---|
| Type | Filter results in real time |
| `↑↓` | Navigate results |
| `Enter` on command | Use command |
| Enter on directory | Preview folder contents |
| Enter (in dir preview) | `cd` into directory |
| D (in detail view) | Move item to trash (with confirmation) |
| Esc (in detail view) | Back to search results |
| Esc (in search) | Cancel and exit search |
| `Enter` on file | Open inline file preview with scroll |
| `↑↓` / `PgUp/PgDn` | Scroll file preview content |
| `Enter` in file preview | Open editor picker |
| `←→` | Navigate editor choices |
| `Esc` | Cancel / back to results |

Results are categorized: Command history, Directories, Files, Builtins, Aliases, Executables.

### General Activity Log (`Ctrl+H` from prompt)

Centralized log of all shell activity. Persisted to `~/.fsh_general_history.json`.

| Category | What is logged |
|---|---|
| Commands | Every command executed |
| File & Folder Mutations | Copy, move, rename operations |
| Trash Operations | Trash, restore, delete, empty trash |

Press `Enter` on a category header to open the **category editor**:
- Navigate, select, and bulk-delete entries within that category
- `Enter` on a command entry pastes it to the prompt
- `Enter` on a non-command entry opens its detail view
- `D` deletes all entries in the category
- `Esc` returns to the main activity log

### File Operations Log (`h` inside `ls` or `dir`)

Every copy, cut, move, and rename is logged with:

| Field | Description |
|---|---|
| ID | Unique identifier |
| From | Source path |
| To | Destination path |
| Timestamp | Date and time |
| Status | `✓` done, `✗` error, `…` pending |

Press `Enter` on any entry for full detail. Press `U` to undo. Persisted to `~/.fsh_fileops.json` (max 200 entries).

### Trash System (`trash`)

| Key | Action |
|---|---|
| `↑↓` | Navigate |
| `Space` | Select / deselect item |
| `a` | Select all |
| `Enter` | Preview file or directory contents |
| `r` | Restore to original location |
| `x` | Delete forever (with confirmation) |
| `D` | Empty entire trash (with confirmation) |
| `s` | Change sort order |
| `Esc` | Deselect / quit |

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

### Neofetch on Startup

Custom system info display with FSH ASCII logo showing OS, kernel, shell version, CPU, RAM, disk, uptime, IP, and color palette.

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
│  [N] New Folder  [T] New File  [S] Sort  [B] Bookmark  [/] Search │ ← minibar
│  ~/projects/fsh  3d  12f  git: fsh (main)         ↓ 8 more     │  ← bottom bar
└─────────────────────────────────────────────────────────────────┘
```

The bottom bar left side now includes the **git status indicator** for the folder under the cursor. The minibar (one row above the bottom bar) shows quick-access shortcuts for creation, sort, bookmarks, and search.

---

## What Makes fsh Different

| Feature | bash/zsh | fsh |
|---|---|---|
| Interactive file browser | ❌ | ✅ Grid with colors |
| Tab completion UI | Basic list | ✅ Visual picker |
| Delete to trash | ❌ | ✅ From ls, dir, and search |
| Git info in prompt | Plugin needed | ✅ Built-in |
| Git status in file browser | ❌ | ✅ Per-file badges + bottom bar |
| File preview panel | ❌ | ✅ Split + overlay, with browse mode |
| Image preview with feh | ❌ | ✅ Auto-sized, auto-centered |
| Quick search in browser | ❌ | ✅ `/` recursive fuzzy search |
| Syntax highlight while typing | Plugin needed | ✅ Built-in, per-category colors |
| History manager UI | ❌ | ✅ Grouped by time |
| Custom neofetch | ❌ | ✅ Built-in |
| Nano-style keyboard navigation | ❌ | ✅ All TUI screens |
| Persistent bottom status bar | ❌ | ✅ Path + git + scroll info |
| Show / hide hidden files toggle | ❌ | ✅ Press `.` in ls / dir |
| In-shell copy / cut / paste | ❌ | ✅ With persistent multi-item clipboard |
| File operations log | ❌ | ✅ Tracked with id + timestamp |
| Undo file operations | ❌ | ✅ Move back, rename back, delete copy |
| Sort options in browser | ❌ | ✅ Name, type, size, date, hidden last |
| Create files/folders inline | ❌ | ✅ `n` and `t` with inline input |
| Pinned/bookmark directories | ❌ | ✅ Gold color + persistent |
| Centralized activity log | ❌ | ✅ Commands + file ops + trash |
| Activity log category editor | ❌ | ✅ Per-category edit, bulk delete |
| Fuzzy search file preview | ❌ | ✅ Inline scroll + editor picker |
| Fuzzy search across all sources | ❌ | ✅ `Ctrl+R` |
| Multi-select for bulk operations | ❌ | ✅ `Space` + `a` |
| Persistent browser (no exit on Enter) | ❌ | ✅ Navigate without leaving ls |
| Keyboard shortcut reference | ❌ | ✅ `helps` command |

---

## Setup

### Prerequisites
- Node.js v16+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- npm
- Linux / WSL Ubuntu

### Install

Clone the repository:

```bash
git clone https://github.com/FKfarell17108/fsh-universe.git
cd fsh-universe
```

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

### Set as Default Shell

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
exec node /home/farell/projects/shell/fsh-universe/dist/main.js "$@"
```

Make executable:

```bash
sudo chmod +x /usr/local/bin/fsh
```

Register as valid shell:

```bash
echo "/usr/local/bin/fsh" | sudo tee -a /etc/shells
```

Set as default:

```bash
chsh -s /usr/local/bin/fsh
```

Restart your terminal.

### Update After Code Changes

```bash
cd ~/path/to/fsh-universe
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
| `~/.fshrc` | Shell configuration: aliases, env vars | - |
| `~/.fsh_neofetch` | Neofetch on/off state | - |

---

## © 2026 Farell Kurniawan

This project is proprietary software under the FK Universe License.
All rights reserved. Unauthorized use, copying, or distribution is strictly prohibited.
This repository is for viewing purposes only.