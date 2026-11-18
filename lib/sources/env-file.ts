import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type EnvFileReport = {
  directory: string;
  files: string[];
  names: string[];
  key: string | null;
  source: string | null;
};

const FILE_NAMES = [".env", ".env.local"];

export function projectDir(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function decodeEnv(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i + 1 < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString("utf16le");
  }
  if (buffer.includes(0)) return buffer.toString("utf16le").replace(/^\uFEFF/, "");
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq < 0) {
      if (/^[A-Za-z0-9_-]{20,}$/.test(body)) out.BETTINGPROS_API_KEY = body;
      continue;
    }
    const name = body.slice(0, eq).trim();
    if (!name) continue;
    let value = body.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[name] = value.trim();
  }
  return out;
}

export function readProjectEnv(directory: string): EnvFileReport {
  const merged: Record<string, string> = {};
  const files: string[] = [];
  let source: string | null = null;
  for (const name of FILE_NAMES) {
    const path = join(directory, name);
    if (!existsSync(path)) continue;
    files.push(name);
    const parsed = parseEnvText(decodeEnv(readFileSync(path)));
    Object.assign(merged, parsed);
    if (parsed.BETTINGPROS_API_KEY?.trim()) source = name;
  }
  const key = merged.BETTINGPROS_API_KEY?.trim() || null;
  return { directory, files, names: Object.keys(merged), key, source: key ? source : null };
}

export function bettingProsKeyIssue(report: EnvFileReport): string {
  if (report.files.length === 0) {
    return `No .env.local or .env in ${report.directory}. Put .env.local next to package.json. One line: BETTINGPROS_API_KEY= followed by the key.`;
  }
  const names = report.names.length ? ` Names in those files: ${report.names.join(", ")}.` : " Those files have no variables.";
  return `The server read ${report.files.join(" and ")} in ${report.directory}, and BETTINGPROS_API_KEY is empty.${names} Use one line, BETTINGPROS_API_KEY= followed by the key.`;
}
