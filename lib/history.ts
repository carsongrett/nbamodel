import { CURRENT_SEASON, gradeResult, idsEqual, STATS, type Actual, type Database, type Grade, type SlateGame, type Stat } from "./engine";

export type HistoryResultFilter = "all" | "win" | "loss";

export const HISTORY_RESULT_OPTIONS: { id: HistoryResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "win", label: "Win" },
  { id: "loss", label: "Loss" },
];

/** Absolute projection-minus-line cutoffs. A row counts in every threshold it clears. */
export const LINE_DISTANCE_THRESHOLDS = [1, 2, 3, 4] as const;

export type HistoryCell = {
  source: "saved" | "preview" | "unavailable";
  grade: Grade;
  projection: number | null;
  line: number | null;
};

export type HistoryRow = {
  gameId: string;
  teamId: string;
  stats: Record<Stat, HistoryCell>;
};

export type HistoryFilters = {
  gameId: string;
  teamId: string;
  stat: Stat;
  result: HistoryResultFilter;
};

export type LineDistanceGroup = {
  threshold: number;
  wins: number;
  losses: number;
  hitRate: number | null;
};

export function historyResultFilter(value: string): HistoryResultFilter {
  if (value === "win" || value === "loss") return value;
  return "all";
}

/** Result text on the History table. CSS uppercases it, so "Not saved" reads NOT SAVED. */
export function historyResultText(cell: Pick<HistoryCell, "source" | "grade">): string {
  if (cell.source !== "saved") return "Not saved";
  if (cell.grade === "win") return "Win";
  if (cell.grade === "loss") return "Loss";
  if (cell.grade === "push") return "Push";
  if (cell.grade === "no_pick") return "No pick";
  if (cell.grade === "dnp") return "DNP";
  if (cell.grade === "unresolved") return "Unresolved";
  return "Not saved";
}

export function matchesHistoryResult(cell: Pick<HistoryCell, "source" | "grade">, filter: HistoryResultFilter): boolean {
  if (historyResultText(cell) === "Not saved") return false;
  if (filter === "win") return historyResultText(cell) === "Win";
  if (filter === "loss") return historyResultText(cell) === "Loss";
  return true;
}

export function absoluteLineDistance(projection: number | null, line: number | null): number | null {
  if (projection == null || line == null) return null;
  if (!Number.isFinite(projection) || !Number.isFinite(line)) return null;
  return Math.abs(projection - line);
}

function clearsThreshold(distance: number, threshold: number): boolean {
  return distance + 1e-9 >= threshold;
}

/** Wins and losses that have a stored line. Not saved rows, pushes, and other grades stay out. */
export function hitRateByLineDistance(
  cells: readonly HistoryCell[],
  thresholds: readonly number[] = LINE_DISTANCE_THRESHOLDS,
): LineDistanceGroup[] {
  const graded = cells.flatMap((cell) => {
    if (cell.grade !== "win" && cell.grade !== "loss") return [];
    if (historyResultText(cell) === "Not saved") return [];
    const distance = absoluteLineDistance(cell.projection, cell.line);
    if (distance == null) return [];
    return [{ grade: cell.grade, distance }];
  });
  return thresholds.map((threshold) => {
    let wins = 0;
    let losses = 0;
    for (const cell of graded) {
      if (!clearsThreshold(cell.distance, threshold)) continue;
      if (cell.grade === "win") wins += 1;
      else losses += 1;
    }
    const decided = wins + losses;
    return {
      threshold,
      wins,
      losses,
      hitRate: decided === 0 ? null : wins / decided,
    };
  });
}

/**
 * View of the History table. Returns the same row objects and does not write grades or lines.
 * Rows whose result is Not saved are omitted. Distance groups use the rows that remain,
 * then drop anything without a line and a win or loss.
 */
export function applyHistoryFilters<T extends HistoryRow>(
  rows: readonly T[],
  filters: HistoryFilters,
): { rows: T[]; distance: LineDistanceGroup[] } {
  const visible = rows.filter((row) => {
    if (filters.gameId && row.gameId !== filters.gameId) return false;
    if (filters.teamId && row.teamId !== filters.teamId) return false;
    return matchesHistoryResult(row.stats[filters.stat], filters.result);
  });
  return {
    rows: visible,
    distance: hitRateByLineDistance(visible.map((row) => row.stats[filters.stat])),
  };
}

export type HistorySummary = {
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  meanAbsoluteError: number | null;
  vegasMeanAbsoluteError: number | null;
};

type SummaryCell = Pick<HistoryCell, "source" | "grade"> & {
  error?: number | null;
  line?: number | null;
  actual?: number | null;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Wins, losses, pushes, and absolute errors for saved History rows. Not saved rows stay out.
 * Model abs error is the average of |projection − actual| on the saved rows that already count.
 * Vegas abs error is the average of |line − actual| on those same rows when the line and actual are present.
 */
export function historySummary(cells: readonly SummaryCell[]): HistorySummary {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let errorTotal = 0;
  let errorCount = 0;
  let vegasTotal = 0;
  let vegasCount = 0;
  for (const cell of cells) {
    if (historyResultText(cell) === "Not saved") continue;
    if (cell.grade === "win") wins += 1;
    else if (cell.grade === "loss") losses += 1;
    else if (cell.grade === "push") pushes += 1;
    const error = cell.error ?? null;
    if (error != null && cell.grade !== "dnp" && cell.grade !== "unresolved") {
      errorTotal += Math.abs(error);
      errorCount += 1;
      if (isFiniteNumber(cell.line) && isFiniteNumber(cell.actual)) {
        vegasTotal += Math.abs(cell.line - cell.actual);
        vegasCount += 1;
      }
    }
  }
  const eligible = wins + losses;
  return {
    wins,
    losses,
    pushes,
    winRate: eligible === 0 ? null : wins / eligible,
    meanAbsoluteError: errorCount === 0 ? null : errorTotal / errorCount,
    vegasMeanAbsoluteError: vegasCount === 0 ? null : vegasTotal / vegasCount,
  };
}

export type HistoryAbsError = {
  meanAbsoluteError: number | null;
  vegasMeanAbsoluteError: number | null;
};

export type HistoryErrorWindows = {
  last15: HistoryAbsError;
  allTime: HistoryAbsError;
};

export type HistoryErrorRow = {
  date: string;
  stat: Stat;
  source: "saved";
  grade: Grade;
  projection: number | null;
  line: number | null;
  actual: number | null;
  error: number | null;
};

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function absError(cells: readonly SummaryCell[]): HistoryAbsError {
  const summary = historySummary(cells);
  return {
    meanAbsoluteError: summary.meanAbsoluteError,
    vegasMeanAbsoluteError: summary.vegasMeanAbsoluteError,
  };
}

/**
 * Last 15 days ends on endDate and includes that date. All time uses every date.
 * The stat is the History stat filter. Both windows use historySummary, so a row
 * counts only when the slate abs error already counts it.
 */
export function historyErrorWindows(rows: readonly HistoryErrorRow[], stat: Stat, endDate: string): HistoryErrorWindows {
  const start = shiftIsoDate(endDate, -14);
  const matching = rows.filter((row) => row.stat === stat);
  const last15 = matching.filter((row) => row.date >= start && row.date <= endDate);
  return {
    last15: absError(last15),
    allTime: absError(matching),
  };
}

export function historyErrorWindowsByStat(rows: readonly HistoryErrorRow[], endDate: string): Record<Stat, HistoryErrorWindows> {
  const windows = {} as Record<Stat, HistoryErrorWindows>;
  for (const stat of STATS) windows[stat] = historyErrorWindows(rows, stat, endDate);
  return windows;
}

function actualNumber(actual: Actual | null, stat: Stat): number | null {
  if (!actual || actual.dnp) return null;
  if (stat === "points") return actual.points;
  if (stat === "rebounds") return actual.rebounds;
  if (actual.points == null || actual.rebounds == null) return null;
  return actual.points + actual.rebounds;
}

/**
 * Saved stats across dates. History stores a stat when it has a line.
 * The grade and error match the slate, so DNP and a game that is not final stay out of the average.
 */
export function historyErrorRows(db: Database): HistoryErrorRow[] {
  return db.pregame.flatMap((row) => {
    const game = db.games.find((item) => idsEqual(item.gameId, row.gameId));
    if (!game || game.season !== CURRENT_SEASON || !/^\d{4}-\d{2}-\d{2}$/.test(game.gameDate)) return [];
    const actual = db.actuals.find((item) => idsEqual(item.playerId, row.playerId) && idsEqual(item.gameId, row.gameId)) ?? null;
    const actualValue = actualNumber(actual, row.stat);
    const graded = gradeResult({
      projection: row.projection,
      line: row.line,
      actual: actualValue,
      dnp: actual?.dnp ?? false,
      gameFinal: game.status === "final",
    });
    return [{
      date: game.gameDate,
      stat: row.stat,
      source: "saved" as const,
      grade: graded.grade,
      projection: row.projection,
      line: row.line,
      actual: actualValue,
      error: graded.error,
    }];
  });
}

export type HistoryGame = SlateGame & {
  awayScore?: number | null;
  homeScore?: number | null;
};

/** Tip order used on Today: earlier tip first, a missing tip last, then the matchup label. */
export function compareGamesByTip(a: { tipAt: string | null; label: string }, b: { tipAt: string | null; label: string }): number {
  const left = a.tipAt ? Date.parse(a.tipAt) : Number.NaN;
  const right = b.tipAt ? Date.parse(b.tipAt) : Number.NaN;
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (leftOk && rightOk && left !== right) return left - right;
  if (leftOk !== rightOk) return leftOk ? -1 : 1;
  return a.label.localeCompare(b.label);
}

/**
 * Final score already stored on the game, away team first.
 * A game that is not final, or a final game with no stored score, has no label.
 */
export function historyScoreLabel(game: Pick<HistoryGame, "status" | "awayTeamId" | "homeTeamId" | "awayScore" | "homeScore">): string | null {
  if (game.status !== "final") return null;
  const away = game.awayScore;
  const home = game.homeScore;
  if (away == null || home == null) return null;
  if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
  return `${game.awayTeamId} ${String(away)}, ${game.homeTeamId} ${String(home)}`;
}

export type HistoryGameGroup<T> = {
  game: HistoryGame;
  rows: T[];
  scoreLabel: string | null;
};

/**
 * Saved players grouped by game in the same tip order as Today.
 * A game with no rows in the list is left out. Row order inside a game is unchanged.
 */
export function groupHistoryByGame<T extends { gameId: string; gameLabel?: string }>(
  rows: readonly T[],
  games: readonly HistoryGame[],
): HistoryGameGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const list = buckets.get(row.gameId);
    if (list) list.push(row);
    else buckets.set(row.gameId, [row]);
  }
  const groups: HistoryGameGroup<T>[] = [];
  const used = new Set<string>();
  for (const game of [...games].sort(compareGamesByTip)) {
    if (used.has(game.gameId)) continue;
    const groupRows = buckets.get(game.gameId);
    if (!groupRows?.length) continue;
    used.add(game.gameId);
    groups.push({ game, rows: groupRows, scoreLabel: historyScoreLabel(game) });
  }
  for (const [gameId, groupRows] of buckets) {
    if (used.has(gameId) || groupRows.length === 0) continue;
    const label = groupRows.find((row) => row.gameLabel)?.gameLabel || gameId;
    groups.push({
      game: {
        gameId,
        label,
        status: "scheduled",
        homeTeamId: "",
        awayTeamId: "",
        spread: null,
        total: null,
        tipAt: null,
        tipLabel: null,
      },
      rows: groupRows,
      scoreLabel: null,
    });
  }
  return groups;
}
