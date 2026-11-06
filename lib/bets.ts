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

export type WinLoss = { wins: number; losses: number };

export type BetRecords = Record<keyof BetWindows, WinLoss>;

export type SettledBetRow = {
  playerName: string;
  units: number;
  result: "Win" | "Loss" | "Push";
};

export type PendingBetRow = {
  playerName: string;
  units: number;
};

type NamedBet = SettledBet & { playerName: string };

function emptyRecords(): BetRecords {
  return {
    today: { wins: 0, losses: 0 },
    last7: { wins: 0, losses: 0 },
    last30: { wins: 0, losses: 0 },
    allTime: { wins: 0, losses: 0 },
  };
}

function countResult(record: WinLoss, grade: Grade): void {
  if (grade === "win") record.wins += 1;
  else if (grade === "loss") record.losses += 1;
}

/** Wins and losses in the same windows as the unit totals. Pushes and pending bets stay out of the record. */
export function betWindowRecords(bets: readonly SettledBet[], today: string): BetRecords {
  const records = emptyRecords();
  const start7 = shiftIsoDate(today, -6);
  const start30 = shiftIsoDate(today, -29);
  for (const bet of bets) {
    if (bet.grade !== "win" && bet.grade !== "loss") continue;
    if (!Number.isFinite(bet.units) || bet.units <= 0) continue;
    countResult(records.allTime, bet.grade);
    if (bet.slateDate > today) continue;
    if (bet.slateDate === today) countResult(records.today, bet.grade);
    if (bet.slateDate >= start7) countResult(records.last7, bet.grade);
    if (bet.slateDate >= start30) countResult(records.last30, bet.grade);
  }
  return records;
}

export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

/**
 * Settled bets are wins, losses, and pushes. Pending bets have units and no actual yet.
 * Pending rows are not wins or losses, and betWindowTotals already leaves them out of the units.
 */
export function betLists(bets: readonly NamedBet[]): { settled: SettledBetRow[]; pending: PendingBetRow[] } {
  const ordered = [...bets].sort((a, b) => b.slateDate.localeCompare(a.slateDate) || a.playerName.localeCompare(b.playerName));
  const settled: SettledBetRow[] = [];
  const pending: PendingBetRow[] = [];
  for (const bet of ordered) {
    if (!Number.isFinite(bet.units) || bet.units <= 0) continue;
    if (bet.grade === "win" || bet.grade === "loss" || bet.grade === "push") {
      settled.push({
        playerName: bet.playerName,
        units: bet.units,
        result: bet.grade === "win" ? "Win" : bet.grade === "loss" ? "Loss" : "Push",
      });
    } else if (bet.grade === "unresolved") {
      pending.push({ playerName: bet.playerName, units: bet.units });
    }
  }
  return { settled, pending };
}

function actualNumber(actual: Actual | null, stat: Stat): number | null {
  if (!actual || actual.dnp) return null;
  if (stat === "points") return actual.points;
  if (stat === "rebounds") return actual.rebounds;
  if (actual.points == null || actual.rebounds == null) return null;
  return actual.points + actual.rebounds;
}

function namedBets(db: Database): NamedBet[] {
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
    const playerName = db.players.find((item) => idsEqual(item.playerId, row.playerId))?.displayName ?? row.playerId;
    return [{ slateDate: row.slateDate, units, grade: graded.grade, playerName }];
  });
}

/** One row per saved stat that has units. The grade is the existing projection-versus-line rule. */
export function betsFromDatabase(db: Database): SettledBet[] {
  return namedBets(db).map(({ slateDate, units, grade }) => ({ slateDate, units, grade }));
}

export type BetTracking = BetWindows & {
  records: BetRecords;
  settled: SettledBetRow[];
  pending: PendingBetRow[];
};

/** Totals use the existing window math. The record and lists are for the Bet tracking page. */
export function betTracking(db: Database, today: string): BetTracking {
  const named = namedBets(db);
  const bets = named.map(({ slateDate, units, grade }) => ({ slateDate, units, grade }));
  const lists = betLists(named);
  return {
    ...betWindowTotals(bets, today),
    records: betWindowRecords(bets, today),
    settled: lists.settled,
    pending: lists.pending,
  };
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
