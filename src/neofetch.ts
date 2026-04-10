import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";

const NEOFETCH_STATE = path.join(process.env.HOME ?? "~", ".fsh_neofetch");

export function isNeofetchEnabled(): boolean {
  try {
    return fs.readFileSync(NEOFETCH_STATE, "utf8").trim() === "on";
  } catch {
    return false;
  }
}

export function setNeofetchState(state: "on" | "off") {
  fs.writeFileSync(NEOFETCH_STATE, state, "utf8");
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

function getOS(): string {
  try {
    const pretty = run("grep PRETTY_NAME /etc/os-release");
    const match = pretty.match(/PRETTY_NAME="(.+)"/);
    if (match) return match[1];
  } catch {}
  return os.type();
}

function getKernel(): string {
  return run("uname -r");
}

function getCPU(): string {
  const win = run("powershell.exe -NoProfile -Command \"(Get-CimInstance Win32_Processor).Name\" 2>/dev/null");
  if (win && win !== "unknown") {
    return win.replace(/\(R\)|\(TM\)/g, "").replace(/\s+/g, " ").trim();
  }
  const raw = run("grep -m1 'model name' /proc/cpuinfo");
  const match = raw.match(/model name\s*:\s*(.+)/);
  if (match) return match[1].replace(/\(R\)|\(TM\)/g, "").replace(/\s+/g, " ").trim();
  return os.cpus()[0]?.model ?? "unknown";
}

function getGPU(): string {
  const win = run("powershell.exe -NoProfile -Command \"(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notlike '*Basic*' } | Select-Object -First 1).Name\" 2>/dev/null");
  if (win && win !== "unknown") return win.trim();
  return run("lspci 2>/dev/null | grep -i 'vga\\|3d\\|display' | head -1 | sed 's/.*: //'") || "unknown";
}

function getRAM(): string {
  const win = run("powershell.exe -NoProfile -Command \"[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB, 1)\" 2>/dev/null");
  if (win && win !== "unknown" && !isNaN(Number(win))) {
    const total = Number(win);
    const used = Math.round((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024 * 10) / 10;
    return `${used} GB used / ${total} GB total`;
  }
  const total = os.totalmem();
  const free = os.freemem();
  const toGB = (b: number) => (b / 1024 / 1024 / 1024).toFixed(1);
  return `${toGB(total - free)} GB / ${toGB(total)} GB`;
}

function getDisk(): string {
  const win = run("powershell.exe -NoProfile -Command \"$d = Get-PSDrive C; [math]::Round($d.Used/1GB,1).ToString() + ' GB used / ' + [math]::Round(($d.Used+$d.Free)/1GB,1).ToString() + ' GB total'\" 2>/dev/null");
  if (win && win !== "unknown" && win.includes("GB")) return win.trim();
  const raw = run("df -h / | tail -1");
  const parts = raw.split(/\s+/);
  if (parts.length >= 5) return `${parts[2]} used / ${parts[1]} total (${parts[4]})`;
  return "unknown";
}

function getUptime(): string {
  const secs = os.uptime();
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getIP(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (name.startsWith("lo")) continue;
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4") return iface.address;
    }
  }
  return "unknown";
}

function getShellVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return `fsh v${pkg.version}`;
  } catch {}
  return "fsh";
}

const FSH_LOGO = [
  "                           ",
  "                           ",
  "  ███████╗███████╗██╗  ██╗ ",
  "  ██╔════╝██╔════╝██║  ██║ ",
  "  █████╗  ███████╗███████║ ",
  "  ██╔══╝  ╚════██║██╔══██║ ",
  "  ██║     ███████║██║  ██║ ",
  "  ╚═╝     ╚══════╝╚═╝  ╚═╝ ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
  "                           ",
];

function colorRow(): string {
  return [
    chalk.bgBlack("   "),
    chalk.bgRed("   "),
    chalk.bgGreen("   "),
    chalk.bgYellow("   "),
    chalk.bgBlue("   "),
    chalk.bgMagenta("   "),
    chalk.bgCyan("   "),
    chalk.bgWhite("   "),
  ].join("");
}

export function printNeofetch() {
  const user = process.env.USER ?? os.userInfo().username;
  const host = os.hostname();

  const c = (s: string) => chalk.cyan.bold(s);
  const g = (s: string) => chalk.gray(s);
  const w = (s: string) => chalk.white(s);
  const label = (s: string) => chalk.cyan(s.padEnd(7));
  const sep = chalk.dim("─".repeat(40));

  const info: string[] = [
    `  ${c(user)}${g("@")}${c(host)}`,
    `  ${sep}`,
    `  ${label("OS")} ${w(getOS())}`,
    `  ${label("Kernel")} ${w(getKernel())}`,
    `  ${label("Shell")} ${w(getShellVersion())}`,
    `  ${sep}`,
    `  ${g("by Farell Kurniawan · github.com/FKfarell17108")}`,
  ];

  const logoLines = FSH_LOGO.map((l, i) =>
    (i >= 2 && i <= 7) ? chalk.cyan(l) : chalk.dim(l)
  );

  const padTop = Math.max(0, Math.floor((info.length - (FSH_LOGO.length - 9)) / 2));
  const logo: string[] = [];
  for (let i = 0; i < info.length; i++) {
    const logoIdx = i - padTop + 2; 
    if (logoIdx >= 0 && logoIdx < logoLines.length) {
      logo.push(logoLines[logoIdx]);
    } else {
      logo.push(" ".repeat(27));
    }
  }

  console.log();
  for (let i = 0; i < info.length; i++) {
    console.log(`${logo[i]}  ${info[i]}`);
  }
  console.log();
}