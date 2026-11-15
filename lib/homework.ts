import { canonicalizeDatabase, type Database, type SlateRow } from "./engine";
import { lineupNameKey, lineupPlayer, noteForPlayer, type LineupTeam } from "./sources/rotowire-lineups";

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
  /** The board already blocked this stat. Ranking leaves that row out. */
  blocked?: boolean;
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

/** Stored results before the slate date. Minutes stay empty when that game was saved without them. */
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

/** Whole minutes from the tenth already shown. A half rounds up. */
function minuteText(value: number): string {
  const tenth = Math.round(value * 10) / 10;
  return String(Math.round(tenth));
}

function matchLogPlayerId(logs: readonly HomeworkLog[], playerName: string, teamId: string): string | null {
  const key = lineupNameKey(playerName);
  if (!key) return null;
  const team = teamId.trim().toUpperCase();
  let hits = logs.filter((log) => lineupNameKey(log.playerName) === key);
  const onTeam = team ? hits.filter((log) => log.teamId === team) : hits;
  if (onTeam.length) hits = onTeam;
  const ids = [...new Set(hits.map((log) => log.playerId))];
  return ids.length === 1 ? ids[0] : null;
}

/** Mean of the last 15 stored games that have minutes. Fewer than 15 uses what exists. */
export function lastFifteenMpgLabel(logs: readonly HomeworkLog[], playerName: string, teamId = ""): string | null {
  const playerId = matchLogPlayerId(logs, playerName, teamId);
  if (!playerId) return null;
  const recent = logs
    .filter((log) => log.playerId === playerId && finite(log.minutes))
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))
    .slice(-15);
  if (recent.length === 0) return null;
  const mean = recent.reduce((sum, log) => sum + (log.minutes as number), 0) / recent.length;
  return `${minuteText(mean)} mpg`;
}

function splitRole(note: string | null): { role: string | null; injury: string | null } {
  if (!note) return { role: null, injury: null };
  const parts = note.split(" · ");
  const injury = parts.find((part) => INJURY_WORDS.includes(part)) ?? null;
  const role = parts.filter((part) => !INJURY_WORDS.includes(part)).join(" · ") || null;
  return { role, injury };
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
    ? `Min ${recent.map((log) => minuteText(log.minutes as number)).join(", ")} · `
    : "";
  return `${minutes}${label} ${values}`;
}

/** Rotowire label Out, and only after this visit's lineup check. A null check leaves the row. */
function markedOut(lineups: readonly LineupTeam[] | null, teamId: string, playerName: string): boolean {
  if (!lineups) return false;
  return lineupPlayer([...lineups], teamId, playerName)?.player.injury === "Out";
}

export function candidatesFromSlate(rows: readonly SlateRow[]): HomeworkCandidate[] {
  return rows.flatMap((row) => (["points", "rebounds"] as const).map((stat) => ({
    playerId: row.playerId,
    gameId: row.gameId,
    playerName: row.playerName,
    teamId: row.teamId,
    opponentId: row.opponentId,
    position: row.position,
    stat,
    projection: row.stats[stat].projection,
    line: row.stats[stat].line,
    edge: row.stats[stat].edge,
    minutesUsed: row.minutesUsed,
    blocked: Boolean(row.stats[stat].blockReason),
  })));
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
  const ranked: { gap: number; row: HomeworkCandidate }[] = [];
  for (const row of input.rows) {
    if (teamId && row.teamId !== teamId) continue;
    if (row.stat !== "points" && row.stat !== "rebounds") continue;
    if (row.blocked) continue;
    if (markedOut(input.lineups, row.teamId, row.playerName)) continue;
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
      note: null,
    };
  });
}
