import { formulaSettings, mergeSettings, type FormulaSettings, type OutsideProjection, type ProjectionInput, type Settings } from "./engine";

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

export function projectionInputFromStoreRow(row: Record<string, unknown>): ProjectionInput | null {
  const stat = row.stat === "points" || row.stat === "rebounds" ? row.stat : null;
  if (!stat) return null;
  return {
    playerId: String(row.player_id),
    gameId: String(row.game_id),
    stat,
    slateDate: String(row.slate_date).slice(0, 10),
    savedAt: String(row.saved_at),
    sportsline: num(row.sportsline),
    dimers: num(row.dimers),
    minutes: num(row.minutes),
    usage: num(row.usage),
    last15Points: num(row.last15_points),
    last15Rebounds: num(row.last15_rebounds),
    opponentPace: num(row.opponent_pace),
    defenseVsPosition: num(row.defense_vs_position),
    oppReboundsAllowed: num(row.opp_rebounds_allowed),
    dvpGap: num(row.dvp_gap),
    paceGap: num(row.pace_gap),
    recentGap: num(row.recent_gap),
    minutesGap: num(row.minutes_gap),
    oppReboundsGap: num(row.opp_rebounds_gap),
    sliders: formulaSettings(mergeSettings(slidersFromStoreRow(row))),
  };
}

export function projectionInputToStoreRow(row: ProjectionInput): Record<string, unknown> {
  return {
    player_id: row.playerId,
    game_id: row.gameId,
    stat: row.stat,
    slate_date: row.slateDate,
    saved_at: row.savedAt,
    sportsline: row.sportsline,
    dimers: row.dimers,
    minutes: row.minutes,
    usage: row.usage,
    last15_points: row.last15Points,
    last15_rebounds: row.last15Rebounds,
    opponent_pace: row.opponentPace,
    defense_vs_position: row.defenseVsPosition,
    opp_rebounds_allowed: row.oppReboundsAllowed,
    dvp_gap: row.dvpGap,
    pace_gap: row.paceGap,
    recent_gap: row.recentGap,
    minutes_gap: row.minutesGap,
    opp_rebounds_gap: row.oppReboundsGap,
    ...sliderColumns(row.sliders),
  };
}

function slidersFromStoreRow(row: Record<string, unknown>): Partial<Settings> {
  return {
    dvpPointsStrength: num(row.dvp_points_strength) ?? undefined,
    dvpReboundsStrength: num(row.dvp_rebounds_strength) ?? undefined,
    pacePointsStrength: num(row.pace_points_strength) ?? undefined,
    paceReboundsStrength: num(row.pace_rebounds_strength) ?? undefined,
    recentPointsStrength: num(row.recent_points_strength) ?? undefined,
    recentReboundsStrength: num(row.recent_rebounds_strength) ?? undefined,
    minutesPointsStrength: num(row.minutes_points_strength) ?? undefined,
    minutesReboundsStrength: num(row.minutes_rebounds_strength) ?? undefined,
    oppReboundsStrength: num(row.opp_rebounds_strength) ?? undefined,
    minRecentGames: num(row.min_recent_games) ?? undefined,
    minRateGames: num(row.min_rate_games) ?? undefined,
  };
}

function sliderColumns(settings: FormulaSettings): Record<string, number> {
  return {
    dvp_points_strength: settings.dvpPointsStrength,
    dvp_rebounds_strength: settings.dvpReboundsStrength,
    pace_points_strength: settings.pacePointsStrength,
    pace_rebounds_strength: settings.paceReboundsStrength,
    recent_points_strength: settings.recentPointsStrength,
    recent_rebounds_strength: settings.recentReboundsStrength,
    minutes_points_strength: settings.minutesPointsStrength,
    minutes_rebounds_strength: settings.minutesReboundsStrength,
    opp_rebounds_strength: settings.oppReboundsStrength,
    min_recent_games: settings.minRecentGames,
    min_rate_games: settings.minRateGames,
  };
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
