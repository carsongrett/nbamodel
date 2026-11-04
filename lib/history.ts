import type { Grade, Stat } from "./engine";

export type HistoryResultFilter = "all" | "win" | "loss" | "not_saved";

export const HISTORY_RESULT_OPTIONS: { id: HistoryResultFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "win", label: "Win" },
  { id: "loss", label: "Loss" },
  { id: "not_saved", label: "Not saved" },
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
  if (value === "win" || value === "loss" || value === "not_saved") return value;
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
  if (filter === "all") return true;
  const text = historyResultText(cell);
  if (filter === "win") return text === "Win";
  if (filter === "loss") return text === "Loss";
  return text === "Not saved";
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
 * Distance groups use that filtered list, then drop anything without a line and a win or loss.
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
