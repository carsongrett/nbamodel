import { canonicalizeDatabase, type Database } from "./engine";
import { lineupNameKey, lineupPlayer, noteForPlayer, type LineupTeam } from "./sources/rotowire-lineups";
import { canonicalTeam, shiftDate } from "./sources/teams";

export type HomeworkStat = "points" | "rebounds";

export type HomeworkCandidate = {
  playerId: string;
  gameId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  position: string;
  stat: HomeworkStat;
  projection: number | null;
  line: number | null;
  /** Board delta. Ranking and the headline use this number, not a second formula. */
  edge: number | null;
  minutesUsed: number | null;
};

/** One stored game before the slate. Minutes stay empty when the store has none. */
export type HomeworkLog = {
  playerId: string;
  playerName: string;
  teamId: string;
  position: string;
  gameId: string;
  date: string;
  points: number | null;
  rebounds: number | null;
  minutes: number | null;
};

export type HomeworkRow = {
  playerId: string;
  gameId: string;
  playerName: string;
  teamId: string;
  opponentId: string;
  stat: HomeworkStat;
  statLabel: "Points" | "Rebounds";
  projection: number;
  line: number;
  delta: number;
  role: string | null;
  injury: string | null;
  last5: string | null;
  note: string | null;
};

const INJURY_WORDS = ["Questionable", "Probable", "Doubtful", "Out", "Out for season"];
const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/i;
const MINUTE_GAMES = 3;
const MINUTE_GAP = 2;
const USUAL_START_GAMES = 3;

/**
 * Stored results before the slate date. Minutes stay empty when that game was saved without them,
 * and the homework sentence then skips the 30-day minute comparison.
 */
export function priorGames(db: Database, date: string): HomeworkLog[] {
  const canon = canonicalizeDatabase(db);
  const gameDate = new Map(canon.games.map((game) => [game.gameId, game.gameDate]));
  const players = new Map(canon.players.map((player) => [player.playerId, player]));
  const seen = new Set<string>();
  const logs: HomeworkLog[] = [];
  for (const actual of canon.actuals) {
    if (actual.dnp) continue;
    if (actual.points == null && actual.rebounds == null) continue;
    const played = gameDate.get(actual.gameId);
    if (!played || played >= date) continue;
    const player = players.get(actual.playerId);
    if (!player) continue;
    const key = `${actual.playerId}|${actual.gameId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    logs.push({
      playerId: player.playerId,
      playerName: player.displayName,
      teamId: player.teamId,
      position: player.position,
      gameId: actual.gameId,
      date: played,
      points: actual.points,
      rebounds: actual.rebounds,
      minutes: finite(actual.minutes) ? actual.minutes : null,
    });
  }
  logs.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId) || a.playerId.localeCompare(b.playerId));
  return logs;
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function numText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function shortName(name: string): string {
  const parts = name.replace(/\./g, "").split(/\s+/).filter(Boolean);
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1] ?? "")) parts.pop();
  return parts[parts.length - 1] ?? name;
}

function splitRole(note: string | null): { role: string | null; injury: string | null } {
  if (!note) return { role: null, injury: null };
  const parts = note.split(" · ");
  const injury = parts.find((part) => INJURY_WORDS.includes(part)) ?? null;
  const role = parts.filter((part) => !INJURY_WORDS.includes(part)).join(" · ") || null;
  return { role, injury };
}

function sameSpot(starter: string, other: string): boolean {
  const a = starter.trim().toUpperCase();
  const b = other.trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (b === "G") return a === "PG" || a === "SG" || a === "G";
  if (b === "F") return a === "SF" || a === "PF" || a === "F";
  if (a === "G") return b === "PG" || b === "SG";
  if (a === "F") return b === "SF" || b === "PF";
  return false;
}

function lastFive(logs: readonly HomeworkLog[], playerId: string, date: string, stat: HomeworkStat): string | null {
  const played = logs
    .filter((log) => log.playerId === playerId && log.date < date && finite(stat === "points" ? log.points : log.rebounds))
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
  const recent = played.slice(-5);
  if (recent.length === 0) return null;
  const label = stat === "points" ? "Pts" : "Reb";
  const values = recent.map((log) => numText((stat === "points" ? log.points : log.rebounds) as number)).join(", ");
  const minutes = recent.every((log) => finite(log.minutes))
    ? `Min ${recent.map((log) => numText(log.minutes as number)).join(", ")} · `
    : "";
  return `${minutes}${label} ${values}`;
}

function recentProduction(logs: readonly HomeworkLog[], playerId: string, date: string): { games: number; average: number } {
  const start = shiftDate(date, -30);
  const played = logs.filter((log) =>
    log.playerId === playerId
    && log.date >= start
    && log.date < date
    && finite(log.points)
    && finite(log.rebounds),
  );
  if (played.length === 0) return { games: 0, average: 0 };
  const total = played.reduce((sum, log) => sum + (log.points as number) + (log.rebounds as number), 0);
  return { games: played.length, average: total / played.length };
}

function playerIdFor(logs: readonly HomeworkLog[], teamId: string, name: string): string | null {
  const key = lineupNameKey(name);
  const ids = new Set(logs.filter((log) => log.teamId === teamId && lineupNameKey(log.playerName) === key).map((log) => log.playerId));
  if (ids.size !== 1) return null;
  return [...ids][0] ?? null;
}

function minutesClause(logs: readonly HomeworkLog[], playerId: string, date: string, minutesUsed: number | null): string | null {
  if (!finite(minutesUsed)) return null;
  const start = shiftDate(date, -30);
  const played = logs.filter((log) => log.playerId === playerId && log.date >= start && log.date < date && finite(log.minutes));
  if (played.length < MINUTE_GAMES) return null;
  const average = played.reduce((sum, log) => sum + (log.minutes as number), 0) / played.length;
  if (Math.abs(minutesUsed - average) < MINUTE_GAP) return null;
  return `Expect ${numText(minutesUsed)} min vs ${numText(average)} min over the last 30 days.`;
}

function replacementSentence(
  row: HomeworkCandidate,
  date: string,
  logs: readonly HomeworkLog[],
  lineups: readonly LineupTeam[] | null,
  roster: ReadonlyMap<string, string>,
): string | null {
  if (!lineups) return null;
  const found = lineupPlayer([...lineups], row.teamId, row.playerName);
  if (!found || found.player.role !== "starter" || !row.position.trim()) return null;
  const teamKey = canonicalTeam(row.teamId) ?? row.teamId.trim().toUpperCase();
  const selfKey = lineupNameKey(row.playerName);
  const starters = found.team.players.filter((player) => player.role === "starter");
  const outs = found.team.players.filter((player) =>
    player.role !== "starter"
    && (player.injury === "Out" || player.injury === "Out for season")
    && lineupNameKey(player.name) !== selfKey,
  );
  const changes: { name: string; injury: "Out" | "Out for season" }[] = [];
  for (const out of outs) {
    const storedId = playerIdFor(logs, teamKey, out.name);
    const storedPos = storedId ? logs.find((log) => log.playerId === storedId)?.position ?? null : null;
    const outSpot = (out.position || storedPos || "").trim();
    if (!outSpot || !sameSpot(row.position, outSpot)) continue;
    const blocked = starters.some((player) => {
      if (lineupNameKey(player.name) === selfKey) return false;
      const pos = roster.get(`${teamKey}|${lineupNameKey(player.name)}`) || player.position || "";
      if (!pos.trim()) return true;
      return sameSpot(pos, outSpot);
    });
    if (blocked || !storedId) continue;
    const replaced = recentProduction(logs, storedId, date);
    if (replaced.games < 1) continue;
    const current = recentProduction(logs, row.playerId, date);
    if (current.games >= USUAL_START_GAMES && current.average >= replaced.average) continue;
    changes.push({ name: out.name, injury: out.injury === "Out for season" ? "Out for season" : "Out" });
  }
  if (changes.length !== 1) return null;
  const change = changes[0];
  const word = change.injury === "Out for season" ? "out for season" : "out";
  return `${shortName(change.name)} ${word}. ${shortName(row.playerName)} starts in his place.`;
}

function homeworkNote(
  row: HomeworkCandidate,
  date: string,
  logs: readonly HomeworkLog[],
  lineups: readonly LineupTeam[] | null,
  roster: ReadonlyMap<string, string>,
): string | null {
  const parts = [
    replacementSentence(row, date, logs, lineups, roster),
    minutesClause(logs, row.playerId, date, row.minutesUsed),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" ") : null;
}

/** Largest points and rebounds gaps together. Eight rows. The board edge is the headline. */
export function homeworkRows(input: {
  date: string;
  teamId?: string;
  rows: readonly HomeworkCandidate[];
  logs: readonly HomeworkLog[];
  lineups: readonly LineupTeam[] | null;
  limit?: number;
}): HomeworkRow[] {
  const teamId = input.teamId ?? "";
  const roster = new Map<string, string>();
  for (const row of input.rows) {
    const key = `${canonicalTeam(row.teamId) ?? row.teamId}|${lineupNameKey(row.playerName)}`;
    if (row.position.trim()) roster.set(key, row.position);
  }
  const ranked: { gap: number; row: HomeworkCandidate }[] = [];
  for (const row of input.rows) {
    if (teamId && row.teamId !== teamId) continue;
    if (row.stat !== "points" && row.stat !== "rebounds") continue;
    if (!finite(row.edge) || !finite(row.projection) || !finite(row.line)) continue;
    ranked.push({ gap: Math.abs(row.edge), row });
  }
  ranked.sort((a, b) =>
    b.gap - a.gap
    || a.row.playerName.localeCompare(b.row.playerName)
    || a.row.stat.localeCompare(b.row.stat)
    || a.row.playerId.localeCompare(b.row.playerId),
  );
  return ranked.slice(0, input.limit ?? 8).map(({ row }) => {
    const split = splitRole(input.lineups ? noteForPlayer([...input.lineups], row.teamId, row.playerName) : null);
    return {
      playerId: row.playerId,
      gameId: row.gameId,
      playerName: row.playerName,
      teamId: row.teamId,
      opponentId: row.opponentId,
      stat: row.stat,
      statLabel: row.stat === "points" ? "Points" : "Rebounds",
      projection: row.projection as number,
      line: row.line as number,
      delta: row.edge as number,
      role: split.role,
      injury: split.injury,
      last5: lastFive(input.logs, row.playerId, input.date, row.stat),
      note: homeworkNote(row, input.date, input.logs, input.lineups, roster),
    };
  });
}
