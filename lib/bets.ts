import { gradeResult, idsEqual, type Actual, type Database, type Grade, type Stat } from "./engine";

export type BetWindows = {
  today: number;
  last7: number;
  last30: number;
  allTime: number;
};

export type SettledBet = {
  slateDate: string;
  units: number;
  grade: Grade;
};

export type BetPlayer = {
  playerId: string;
  gameId: string;
  playerName: string;
  units: number;
  result: "Win" | "Loss" | "Push";
};

/** Even money. A win pays the units, a loss costs them, and a push is 0. Anything unsettled is left out. */
export function betProfit(units: number, grade: Grade): number | null {
  if (!Number.isFinite(units) || units <= 0) return null;
  if (grade === "win") return units;
  if (grade === "loss") return -units;
  if (grade === "push") return 0;
  return null;
}

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Units up or down. Today, the last 7 days, and the last 30 days include today.
 * The date is the slate day stored with the line. Pending bets are already omitted by betProfit.
 */
export function betWindowTotals(bets: readonly SettledBet[], today: string): BetWindows {
  const totals: BetWindows = { today: 0, last7: 0, last30: 0, allTime: 0 };
  const start7 = shiftIsoDate(today, -6);
  const start30 = shiftIsoDate(today, -29);
  for (const bet of bets) {
    const profit = betProfit(bet.units, bet.grade);
    if (profit == null) continue;
    totals.allTime += profit;
    if (bet.slateDate > today) continue;
    if (bet.slateDate === today) totals.today += profit;
    if (bet.slateDate >= start7) totals.last7 += profit;
    if (bet.slateDate >= start30) totals.last30 += profit;
  }
  return totals;
}

function actualNumber(actual: Actual | null, stat: Stat): number | null {
  if (!actual || actual.dnp) return null;
  if (stat === "points") return actual.points;
  if (stat === "rebounds") return actual.rebounds;
  if (actual.points == null || actual.rebounds == null) return null;
  return actual.points + actual.rebounds;
}

/** One row per saved stat that has units. The grade is the existing projection-versus-line rule. */
export function betsFromDatabase(db: Database): SettledBet[] {
  return db.pregame.flatMap((row) => {
    const units = row.units;
    if (units == null || !(units > 0)) return [];
    const game = db.games.find((item) => idsEqual(item.gameId, row.gameId));
    const actual = db.actuals.find((item) => idsEqual(item.playerId, row.playerId) && idsEqual(item.gameId, row.gameId)) ?? null;
    const graded = gradeResult({
      projection: row.projection,
      line: row.line,
      actual: actualNumber(actual, row.stat),
      dnp: actual?.dnp ?? false,
      gameFinal: game?.status === "final",
    });
    return [{ slateDate: row.slateDate, units, grade: graded.grade }];
  });
}

type BetRow = {
  playerId: string;
  gameId: string;
  playerName: string;
  stats: Record<Stat, { source: string; units?: number | null; grade: Grade }>;
};

/** Saved bets on this stat whose result is a win, a loss, or a push. */
export function betPlayers(rows: readonly BetRow[], stat: Stat): BetPlayer[] {
  const listed: BetPlayer[] = [];
  for (const row of rows) {
    const cell = row.stats[stat];
    if (cell.source !== "saved") continue;
    if (cell.units == null || !(cell.units > 0)) continue;
    if (cell.grade !== "win" && cell.grade !== "loss" && cell.grade !== "push") continue;
    listed.push({
      playerId: row.playerId,
      gameId: row.gameId,
      playerName: row.playerName,
      units: cell.units,
      result: cell.grade === "win" ? "Win" : cell.grade === "loss" ? "Loss" : "Push",
    });
  }
  return listed;
}

export function formatUnits(value: number): string {
  const rounded = Object.is(value, -0) ? 0 : Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return "0";
}

export function formatStake(units: number): string {
  if (!Number.isFinite(units)) return "—";
  const rounded = Math.round(units * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
