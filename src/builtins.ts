import { printNeofetch, isNeofetchEnabled, setNeofetchState } from "./neofetch";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { interactiveLs, LsResult } from "./interactiveLs";
import { interactiveDir } from "./interactiveDir";
import { pauseInput, resumeInput, resumeInputAndExecute, resumeInputWithLine, reloadHistoryInRl } from "./main";
import { showGeneralHistory } from "./generalHistory";
import { interactiveTrash } from "./trashLs";
import { setAlias, removeAlias, getAllAliases } from "./aliases";
import { loadFshrc, generateDefaultFshrc } from "./fshrc";
import { showBookmarkPicker } from "./bookmarkPicker";
import { loadBookmarks } from "./bookmarks";
import { showSearch } from "./search";
import { loadHistoryEntries } from "./historyManager";
import { showHelps } from "./helps";
import { spawn } from "child_process";

const builtins = [
  "exit", "echo", "type", "pwd", "cd", "ls", "dir",
  "alias", "unalias", "clear", "cls", "history", "fshrc", "trash", "neofetch",
  "bookmarks", "search", "helps",
];

export function handleBuiltin(
  cmd: string,
  args: string[],
  done: () => void
): boolean {
  switch (cmd) {
    case "helps":
      pauseInput();
      showHelps(() => resumeInput());
      return true;

    case "neofetch":
      handleNeofetch(args);
      done();
      return true;

    case "trash":
      pauseInput();
      interactiveTrash(() => resumeInput());
      return true;

    case "history":
      pauseInput();
      showGeneralHistory(() => resumeInput());
      return true;

    case "bookmarks":
      pauseInput();
      loadBookmarks();
      showBookmarkPicker(
        process.cwd(),
        (dir) => {
          try { process.chdir(dir); } catch { }
          resumeInput();
        },
        () => resumeInput()
      );
      return true;

    case "search":
      pauseInput();
      showSearch(
        loadHistoryEntries(),
        (value) => resumeInputWithLine(value),
        () => resumeInput()
      );
      return true;

    case "fshrc":
      handleFshrc(args, done);
      return true;

    case "clear":
    case "cls": {
      const rows = process.stdout.rows || 24;
      process.stdout.write("\n".repeat(rows) + "\x1b[3J\x1b[2J\x1b[H");
      done();
      return true;
    }

    case "exit":
      process.exit(0);

    case "echo":
      console.log(args.join(" "));
      done();
      return true;

    case "type":
      handleType(args);
      done();
      return true;

    case "pwd":
      console.log(process.cwd());
      done();
      return true;

    case "cd":
      handleCd(args);
      done();
      return true;

    case "ls":
      pauseInput();
      interactiveLs((result: LsResult) => {
        if (result.kind === "open") {
          const cmdLine = `${result.editor} "${result.file}"`;
          resumeInputAndExecute(cmdLine);
        } else {
          resumeInput();
        }
      });
      return true;

    case "dir":
      pauseInput();
      interactiveDir((result: LsResult) => {
        if (result.kind === "open") {
          const cmdLine = `${result.editor} "${result.file}"`;
          resumeInputAndExecute(cmdLine);
        } else {
          resumeInput();
        }
      });
      return true;

    case "alias":
      handleAlias(args);
      done();
      return true;

    case "unalias":
      handleUnalias(args);
      done();
      return true;

    case "fsh":
      handleFsh(done);
      return true;

    default:
      return false;
  }
}

function handleAlias(args: string[]) {
  if (args.length === 0) {
    const all = getAllAliases();
    if (all.size === 0) {
      console.log("(no aliases defined)");
    } else {
      for (const [name, value] of all) {
        console.log(`alias ${name}='${value}'`);
      }
    }
    return;
  }

  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq === -1) {
      const val = getAllAliases().get(arg);
      if (val !== undefined) {
        console.log(`alias ${arg}='${val}'`);
      } else {
        console.log(`fsh: alias: ${arg}: not found`);
      }
    } else {
      const name = arg.slice(0, eq).trim();
      let value = arg.slice(eq + 1).trim();
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      if (!name) {
        console.log(`fsh: alias: invalid name`);
        return;
      }
      setAlias(name, value);
    }
  }
}

function handleUnalias(args: string[]) {
  if (args.length === 0) {
    console.log("usage: unalias <n>");
    return;
  }
  for (const name of args) {
    if (!removeAlias(name)) {
      console.log(`fsh: unalias: ${name}: not found`);
    }
  }
}

function handleCd(args: string[]) {
  let target = args[0];
  const home = process.env.HOME || process.env.USERPROFILE;

  if (!target || target === "~") target = home || "";
  if (target.startsWith("~/") && home) {
    target = path.join(home, target.slice(2));
  }

  try {
    process.chdir(target);
  } catch {
    console.log(`cd: ${target}: No such file or directory`);
  }
}

function handleType(args: string[]) {
  const target = args[0];
  if (!target) return;

  const allAliases = getAllAliases();
  if (allAliases.has(target)) {
    console.log(`${target} is aliased to '${allAliases.get(target)}'`);
    return;
  }

  if (builtins.includes(target)) {
    console.log(`${target} is a shell builtin`);
    return;
  }

  const paths = process.env.PATH?.split(":") || [];
  for (const p of paths) {
    const fullPath = path.join(p, target);
    if (fs.existsSync(fullPath)) {
      console.log(`${target} is ${fullPath}`);
      return;
    }
  }

  console.log(`${target}: not found`);
}

async function handleFshrc(args: string[], done: () => void) {
  const FSHRC = path.join(process.env.HOME ?? "~", ".fshrc");
  const sub = args[0];

  const validSubs = ["init", "reload", "path", "version"];

  if (!sub || !validSubs.includes(sub)) {
    console.log(chalk.bold("\n FSH Configuration Manager"));
    console.log(chalk.gray(" usage: fshrc <command>\n"));
    console.log(` ${chalk.cyan("init")}     ${chalk.white("Generate a default .fshrc file")}`);
    console.log(` ${chalk.cyan("reload")}   ${chalk.white("Refresh shell configurations")}`);
    console.log(` ${chalk.cyan("path")}     ${chalk.white("Show the location of your .fshrc")}`);
    console.log(` ${chalk.cyan("version")}  ${chalk.white("Show current fsh version")}\n`);
    done();
    return;
  }

  if (sub === "init") {
    if (fs.existsSync(FSHRC)) {
      console.log(chalk.red(`~/.fshrc already exists. Run 'fshrc reload' to apply changes.`));
    } else {
      fs.writeFileSync(FSHRC, generateDefaultFshrc(), "utf8");
      console.log(chalk.green("✓") + ` Created ~/.fshrc successfully.`);
    }
    done();
    return;
  }

  if (sub === "reload") {
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let i = 0;

    process.stdout.write("\x1B[?25l");

    const loader = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i])} status: refreshing shell system...`);
      i = (i + 1) % frames.length;
    }, 80);

    setTimeout(() => {
      clearInterval(loader);

      const oldMain = require("./main");
      oldMain.pauseInput();

      Object.keys(require.cache).forEach((key) => {
        if (key.includes("/src/") || key.includes("/dist/")) {
          delete require.cache[key];
        }
      });

      process.stdout.write("\r\x1b[K");
      console.log(`status: ${chalk.green("fsh reloaded")}`);
      process.stdout.write("\x1B[?25h");

      const freshMain = require("./main");

      const { loadFshrc } = require("./fshrc");
      const { loadBookmarks } = require("./bookmarks");
      const { loadLog } = require("./fileOps");
      const { loadGeneralHistory } = require("./generalHistory");

      loadFshrc();
      loadBookmarks();
      loadLog();
      loadGeneralHistory();

      freshMain.startPrompt();
    }, 1200);

    return;
  }

  if (sub === "path") {
    console.log(FSHRC);
    done();
    return;
  }

  if (sub === "version") {
    try {
      const pkgPath = path.join(__dirname, "..", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      console.log(`fsh v${pkg.version}`);
    } catch (e) {
      console.log(`status: ${chalk.red("fsh version not detected")}`);
    }
    done();
    return;
  }
}

function handleNeofetch(args: string[]) {
  const sub = args[0];

  if (!sub || !["on", "off", "preview"].includes(sub)) {
    console.log(chalk.bold("\n Neofetch Manager"));
    console.log(chalk.gray(" usage: neofetch <command>\n"));
    console.log(` ${chalk.cyan("preview")}  ${chalk.white("Show neofetch")}`);
    console.log(` ${chalk.cyan("on")}       ${chalk.white("Enable neofetch to show on every startup")}`);
    console.log(` ${chalk.cyan("off")}      ${chalk.white("Disable neofetch on startup")}\n`);
    return;
  }

  if (sub === "on") {
    setNeofetchState("on");
    console.log(`status: ${chalk.green("neofetch on")}`);
    return;
  }

  if (sub === "off") {
    setNeofetchState("off");
    console.log(`status: ${chalk.red("neofetch off")}`);
    return;
  }

  if (sub === "preview") {
    printNeofetch();
    return;
  }
}

function handleFsh(done: () => void) {
  const pkgPath = path.join(__dirname, "..", "package.json");
  let version = "2.1.3";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    version = pkg.version;
  } catch (e) { }

  console.log(chalk.bold("\n FSH (FK Shell)"));
  console.log(chalk.gray(" The core terminal of FK Universe\n"));

  console.log(` ${chalk.cyan("Description")}  ${chalk.white("A custom full-stack terminal for productivity and innovation")}`);
  console.log(` ${chalk.cyan("Purpose")}      ${chalk.white("Creating technology-based solutions for society")}`);
  console.log(` ${chalk.cyan("Framework")}    ${chalk.white("Built with TypeScript, Node.js, and Unix principles")}`);
  console.log(` ${chalk.cyan("Developer")}    ${chalk.white("Farell Kurniawan")}`);
  console.log(` ${chalk.cyan("Version")}      ${chalk.white("v" + version)}\n`);

  console.log(chalk.gray(" Type 'helps' to see available commands or 'fshrc' for config.\n"));

  done();
}