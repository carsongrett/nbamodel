import type { OutsideProjection } from "./engine";

/** PostgREST returns at most one page per request. The default cap is 1000. */
export const STORE_PAGE_SIZE = 1000;

export type StorePage = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

export async function selectAllRows(
  table: string,
  fetchPage: (from: number, to: number) => Promise<StorePage>,
  pageSize = STORE_PAGE_SIZE,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function projectionFromStoreRow(row: Record<string, unknown>): OutsideProjection {
  return {
    playerId: String(row.player_id),
    gameId: String(row.game_id),
    source: String(row.source),
    season: String(row.season),
    points: num(row.points),
    rebounds: num(row.rebounds),
    minutes: num(row.minutes),
    sourceTimestamp: str(row.source_timestamp),
  };
}

export async function loadOutsideProjections(
  fetchPage: (from: number, to: number) => Promise<StorePage>,
): Promise<OutsideProjection[]> {
  const rows = await selectAllRows("outside_projections", fetchPage);
  return rows.map(projectionFromStoreRow);
}

export function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function str(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}
