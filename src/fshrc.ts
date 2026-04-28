import fs from "fs";
import path from "path";
import { setAlias } from "./aliases";

const FSHRC = path.join(process.env.HOME ?? "~", ".fshrc");

function expandEnv(val: string): string {
  return val.replace(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name1, name2) => {
    const name = name1 || name2;
    if (name === "PATH") return "$PATH";
    return process.env[name] ?? "";
  });
}

export function loadFshrc() {
  let src: string;
  try {
    src = fs.readFileSync(FSHRC, "utf8");
  } catch {
    return;
  }

  if (process.env.PATH === undefined) {
    process.env.PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  }

  for (const raw of src.split("\n")) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("alias ")) {
      const rest = line.slice(6).trim();
      const eq = rest.indexOf("=");
      if (eq === -1) continue;
      const name = rest.slice(0, eq).trim();
      let value = rest.slice(eq + 1).trim();
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      if (name) setAlias(name, value);
      continue;
    }

    const exportLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIdx = exportLine.indexOf("=");
    if (eqIdx !== -1) {
      const key = exportLine.slice(0, eqIdx).trim();
      let val = exportLine.slice(eqIdx + 1).trim();
      if (
        (val.startsWith("'") && val.endsWith("'")) ||
        (val.startsWith('"') && val.endsWith('"'))
      ) {
        val = val.slice(1, -1);
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        if (key === "PATH") {
          const currentPath: string = process.env.PATH ?? "";
          let expanded = expandEnv(val);

          if (!expanded.includes("$PATH")) {
            expanded = expanded + ":$PATH";
          }

          const merged = expanded.replace(/\$PATH/g, currentPath);
          
          const parts = merged.split(":").filter(Boolean);
          process.env.PATH = Array.from(new Set(parts)).join(":");
        } else {
          process.env[key] = expandEnv(val);
        }
      }
    }
  }
}

export function generateDefaultFshrc(): string {
  return `# ~/.fshrc — fsh configuration file
# Loaded automatically on startup

# ── PATH (IMPORTANT) ─────────────────────────────────────────────────────────
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="$HOME/.npm-global/bin:$PATH"
export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"

# ── Aliases ───────────────────────────────────────────────────────────────────
alias ll='ls -la'
alias ..='cd ..'
alias ...='cd ../..'
alias gs='git status'
alias ga='git add .'
alias gc='git commit -m'
alias gp='git push'
alias gl='git log --oneline'

# ── Environment variables ─────────────────────────────────────────────────────
# export EDITOR=nano
# export NODE_ENV=development
`;
}