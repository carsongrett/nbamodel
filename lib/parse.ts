export type RawRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export function normalizeCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

export function parseCsv(text: string): { rows: RawRow[]; error?: string } {
  const src = text.replace(/^\uFEFF/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    table.push(row);
  }
  const nonEmpty = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { rows: [], error: "The file has no header row." };
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  if (headers.some((h) => h === "")) {
    return { rows: [], error: "The header row has an empty column name." };
  }
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) return { rows: [], error: `Duplicate column "${h}".` };
    seen.add(h);
  }
  const rows: RawRow[] = [];
  for (let r = 1; r < nonEmpty.length; r++) {
    const values: Record<string, string> = {};
    headers.forEach((h, c) => {
      values[h] = (nonEmpty[r][c] ?? "").trim();
    });
    rows.push({ rowNumber: r + 1, values });
  }
  return { rows };
}

export function parseJsonTable(text: string): { rows: RawRow[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], error: "JSON could not be parsed." };
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null;
  if (!list) return { rows: [], error: "JSON must be an array of objects, or { \"rows\": [...] }." };
  const rows: RawRow[] = [];
  list.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      rows.push({ rowNumber: index + 1, values: { __invalid: "true" } });
      return;
    }
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(item)) {
      if (value && typeof value === "object") continue;
      values[key.trim().toLowerCase()] = normalizeCell(value);
    }
    rows.push({ rowNumber: index + 1, values });
  });
  return { rows };
}

export function parseTable(adapter: "csv" | "json", text: string): { rows: RawRow[]; error?: string } {
  if (adapter === "csv") return parseCsv(text);
  if (adapter === "json") return parseJsonTable(text);
  return { rows: [], error: "Adapter must be csv or json." };
}
