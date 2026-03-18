// ─── Types ───────────────────────────────────────────────────────────────────

export type Redirect = {
  type: ">" | ">>" | "<";
  file: string;
};

export type Command = {
  cmd: string;
  args: string[];
  redirects: Redirect[];
};

// A pipeline is a sequence of commands connected by |
export type Pipeline = {
  commands: Command[];
  background: boolean; // trailing &
};

// A statement is pipelines connected by ;, &&, or ||
export type Statement =
  | { kind: "pipeline"; pipeline: Pipeline }
  | { kind: "and"; left: Statement; right: Statement }   // &&
  | { kind: "or"; left: Statement; right: Statement }    // ||
  | { kind: "seq"; left: Statement; right: Statement };  // ;

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type Token =
  | { type: "word"; value: string }
  | { type: "pipe" }
  | { type: "and" }
  | { type: "or" }
  | { type: "semi" }
  | { type: "amp" }
  | { type: "redir"; op: ">" | ">>" | "<" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  function expandVars(s: string): string {
    return s.replace(/\$([A-Za-z_][A-Za-z0-9_]*|\?)/g, (_, name) => {
      if (name === "?") return String(process.exitCode ?? 0);
      return process.env[name] ?? "";
    });
  }

  while (i < input.length) {
    const ch = input[i];

    // Skip whitespace
    if (ch === " " || ch === "\t") { i++; continue; }

    // Operators: &&, ||, >>, >, <, |, ;, &
    if (ch === "&" && input[i + 1] === "&") { tokens.push({ type: "and" }); i += 2; continue; }
    if (ch === "|" && input[i + 1] === "|") { tokens.push({ type: "or" }); i += 2; continue; }
    if (ch === ">" && input[i + 1] === ">") { tokens.push({ type: "redir", op: ">>" }); i += 2; continue; }
    if (ch === ">") { tokens.push({ type: "redir", op: ">" }); i++; continue; }
    if (ch === "<") { tokens.push({ type: "redir", op: "<" }); i++; continue; }
    if (ch === "|") { tokens.push({ type: "pipe" }); i++; continue; }
    if (ch === ";") { tokens.push({ type: "semi" }); i++; continue; }
    if (ch === "&") { tokens.push({ type: "amp" }); i++; continue; }

    // Word (quoted or unquoted)
    let word = "";
    let escape = false;

    while (i < input.length) {
      const c = input[i];

      if (escape) { word += c; escape = false; i++; continue; }
      if (c === "\\") { escape = true; i++; continue; }

      // Double-quoted string — expand vars inside
      if (c === '"') {
        i++;
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            i++;
            word += input[i];
          } else {
            word += input[i];
          }
          i++;
        }
        i++; // closing "
        continue;
      }

      // Single-quoted string — no expansion
      if (c === "'") {
        i++;
        while (i < input.length && input[i] !== "'") {
          word += input[i++];
        }
        i++; // closing '
        continue;
      }

      // Stop word at operators or whitespace
      if (
        c === " " || c === "\t" ||
        c === "|" || c === ">" || c === "<" ||
        c === ";" || c === "&"
      ) break;

      word += c;
      i++;
    }

    if (word.length > 0) {
      tokens.push({ type: "word", value: expandVars(word) });
    }
  }

  return tokens;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  consume(): Token { return this.tokens[this.pos++]; }

  // statement := and_or ( ';' and_or )*
  parseStatement(): Statement | null {
    let left = this.parseAndOr();
    if (!left) return null;

    while (this.peek()?.type === "semi") {
      this.consume();
      const right = this.parseAndOr();
      if (!right) break;
      left = { kind: "seq", left, right };
    }

    return left;
  }

  // and_or := pipeline ( ('&&' | '||') pipeline )*
  parseAndOr(): Statement | null {
    let left = this.parsePipeline();
    if (!left) return null;

    while (true) {
      const t = this.peek();
      if (t?.type === "and") {
        this.consume();
        const right = this.parsePipeline();
        if (!right) break;
        left = { kind: "and", left, right };
      } else if (t?.type === "or") {
        this.consume();
        const right = this.parsePipeline();
        if (!right) break;
        left = { kind: "or", left, right };
      } else {
        break;
      }
    }

    return left;
  }

  // pipeline := command ( '|' command )* ['&']
  parsePipeline(): Statement | null {
    const first = this.parseCommand();
    if (!first) return null;

    const commands: Command[] = [first];

    while (this.peek()?.type === "pipe") {
      this.consume();
      const cmd = this.parseCommand();
      if (cmd) commands.push(cmd);
    }

    let background = false;
    if (this.peek()?.type === "amp") {
      this.consume();
      background = true;
    }

    return { kind: "pipeline", pipeline: { commands, background } };
  }

  // command := word+ redirect*
  parseCommand(): Command | null {
    const words: string[] = [];
    const redirects: Redirect[] = [];

    while (true) {
      const t = this.peek();
      if (!t) break;

      if (t.type === "word") {
        this.consume();
        words.push(t.value);
      } else if (t.type === "redir") {
        this.consume();
        const fileToken = this.peek();
        if (fileToken?.type === "word") {
          this.consume();
          redirects.push({ type: t.op, file: fileToken.value });
        }
      } else {
        break;
      }
    }

    if (words.length === 0) return null;

    return {
      cmd: words[0],
      args: words.slice(1),
      redirects,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseInput(input: string): Statement | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  const parser = new Parser(tokens);
  return parser.parseStatement();
}