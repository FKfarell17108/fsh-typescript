import fs from "fs";
import path from "path";
import { interactiveLs } from "./interactiveLs";
import { pauseInput, resumeInput } from "./main";
import { setAlias, removeAlias, getAllAliases } from "./aliases";

const builtins = ["exit", "echo", "type", "pwd", "cd", "ls", "alias", "unalias"];

export function handleBuiltin(
  cmd: string,
  args: string[],
  done: () => void
): boolean {
  switch (cmd) {
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
      interactiveLs(() => {
        resumeInput();
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

    default:
      return false;
  }
}

function handleAlias(args: string[]) {
  // No args — list all aliases
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
      // alias <name> — show single alias
      const val = getAllAliases().get(arg);
      if (val !== undefined) {
        console.log(`alias ${arg}='${val}'`);
      } else {
        console.log(`fsh: alias: ${arg}: not found`);
      }
    } else {
      // alias <name>=<value>
      const name = arg.slice(0, eq).trim();
      let value = arg.slice(eq + 1).trim();
      // Strip surrounding quotes if present
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
    console.log("usage: unalias <name>");
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