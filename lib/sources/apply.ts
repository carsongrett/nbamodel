import {
  CURRENT_SEASON,
  POSITIONS,
  upsertByKey,
  type Actual,
  type Database,
  type Dvp,
  type Game,
  type IdMap,
  type ModelMessage,
  type OutsideProjection,
  type Player,
  type PlayerRate,
  type Position,
  type Team,
} from "../engine";
import { normalizePersonName } from "./names";
import { pageIsCurrentSeason, parseBrefPlayers, parseHashtag, parseSportsLine, type BrefPlayerRow } from "./parsers";
import { matchupGameId } from "./teams";

export const BREF = "basketball-reference";
export const SPORTSLINE = "sportsline";
export const HASHTAG = "hashtag";

export type FetchedPage = { url: string; ok: true; html: string } | { url: string; ok: false; error: string };

export type PublicFetch = {
  advanced: FetchedPage;
  perGame: FetchedPage;
  last15: { date: string; page: FetchedPage }[];
  actuals: FetchedPage;
  sportsline: FetchedPage;
  hashtag: FetchedPage;
  retrievedAt: string;
};

type Roster = {
  playerId: string;
  name: string;
  team: string | null;
  position: Position | null;
  usgPct: number | null;
  usgGames: number | null;
  trbPerGame: number | null;
  mpPerGame: number | null;
  games: number | null;
};

function isPosition(value: string | null): value is Position {
  return value != null && (POSITIONS as readonly string[]).includes(value);
}

function firstPosition(value: string | null): Position | null {
  if (!value) return null;
  const token = value.split("-")[0]?.trim() ?? "";
  return isPosition(token) ? token : null;
}

function blankRate(playerId: string, retrievedAt: string): PlayerRate {
  return {
    playerId,
    season: CURRENT_SEASON,
    ptsPer100: null,
    ptsPer100Games: null,
    usgPct: null,
    usgGames: null,
    rebPerMinute: null,
    rebPerMinuteGames: null,
    recentPointsPerGame: null,
    recentReboundsPerGame: null,
    recentGames: null,
    sourceTimestamp: retrievedAt,
  };
}

function foldRoster(rows: BrefPlayerRow[]): Map<string, Roster> {
  const map = new Map<string, Roster>();
  for (const row of rows) {
    const current = map.get(row.playerId) ?? {
      playerId: row.playerId,
      name: row.name,
      team: null,
      position: null,
      usgPct: null,
      usgGames: null,
      trbPerGame: null,
      mpPerGame: null,
      games: null,
    };
    current.name = row.name || current.name;
    const position = firstPosition(row.position);
    if (position) current.position = position;
    if (row.combined) {
      if (row.usgPct != null) current.usgPct = row.usgPct;
      if (row.games != null) current.usgGames = row.games;
      if (row.trbPerGame != null) current.trbPerGame = row.trbPerGame;
      if (row.mpPerGame != null) current.mpPerGame = row.mpPerGame;
      if (row.games != null) current.games = row.games;
    } else if (row.team) {
      current.team = row.team;
      if (current.usgPct == null && row.usgPct != null) current.usgPct = row.usgPct;
      if (current.usgGames == null && row.games != null) current.usgGames = row.games;
      if (current.trbPerGame == null && row.trbPerGame != null) current.trbPerGame = row.trbPerGame;
      if (current.mpPerGame == null && row.mpPerGame != null) current.mpPerGame = row.mpPerGame;
      if (current.games == null && row.games != null) current.games = row.games;
    }
    map.set(row.playerId, current);
  }
  return map;
}

export function stripSample(db: Database): { db: Database; removed: number } {
  const samplePlayer = (id: string) => id.startsWith("player_");
  const sampleGame = (id: string) => id.startsWith("game_");
  const players = db.players.filter((row) => !samplePlayer(row.playerId));
  const games = db.games.filter((row) => !sampleGame(row.gameId));
  const removed = (db.players.length - players.length) + (db.games.length - games.length);
  return {
    removed,
    db: {
      ...db,
      players,
      games,
      projections: db.projections.filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId)),
      lines: db.lines.filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId) && row.source !== "samplebook"),
      rates: db.rates.filter((row) => !samplePlayer(row.playerId)),
      actuals: db.actuals.filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId)),
      pregame: db.pregame.filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId)),
      overrides: db.overrides.filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId)),
      idMap: db.idMap.filter((row) => !samplePlayer(row.canonicalId)),
      research: db.research.filter((row) => row.playerId == null || !samplePlayer(row.playerId)),
    },
  };
}

export function applyPublicPages(db: Database, slateDate: string, fetched: PublicFetch): { db: Database; messages: ModelMessage[] } {
  const stripped = stripSample(db);
  db = stripped.db;
  const messages: ModelMessage[] = [];
  if (stripped.removed > 0) {
    messages.push({ level: "info", playerId: null, message: `Removed ${stripped.removed} sample players and games.` });
  }
  let teams = db.teams.slice();
  let players = db.players.slice();
  let games = db.games.slice();
  let idMap = db.idMap.slice();
  let rates = db.rates.slice();
  let projections = db.projections.slice();
  let dvp = db.dvp.slice();
  let actuals = db.actuals.slice();

  const ensureTeam = (teamId: string) => {
    if (teams.some((team) => team.teamId === teamId)) return;
    teams = upsertByKey(teams, [{ teamId, name: teamId }], (team: Team) => team.teamId).rows;
  };
  const ensureGame = (game: Game) => {
    const existing = games.find((row) => row.gameId === game.gameId);
    const next = existing ? { ...game, status: existing.status === "final" ? existing.status : game.status } : game;
    games = upsertByKey(games, [next], (row) => row.gameId).rows;
  };
  const remember = (sourceId: string) => {
    const row: IdMap = { source: BREF, entityType: "player", sourceId, canonicalId: sourceId };
    idMap = upsertByKey(idMap, [row], (item) => `${item.source}|${item.entityType}|${item.sourceId}`).rows;
  };
  const writeRate = (playerId: string, patch: Partial<PlayerRate>) => {
    const existing = rates.find((rate) => rate.playerId === playerId && rate.season === CURRENT_SEASON);
    const base = existing ?? blankRate(playerId, fetched.retrievedAt);
    const next: PlayerRate = { ...base, sourceTimestamp: fetched.retrievedAt };
    for (const [key, value] of Object.entries(patch)) {
      if (value != null) (next as Record<string, unknown>)[key] = value;
    }
    rates = upsertByKey(rates, [next], (rate) => rate.playerId).rows;
  };

  const seasonPages: { label: string; page: FetchedPage; kind: "advanced" | "perGame" }[] = [
    { label: "Basketball Reference advanced", page: fetched.advanced, kind: "advanced" },
    { label: "Basketball Reference per game", page: fetched.perGame, kind: "perGame" },
  ];
  const roster = new Map<string, Roster>();
  for (const item of seasonPages) {
    if (!item.page.ok) {
      messages.push({ level: "error", playerId: null, message: `${item.label} failed: ${item.page.error}` });
      continue;
    }
    if (!pageIsCurrentSeason(item.page.html)) {
      messages.push({ level: "error", playerId: null, message: `${item.label} is not a 2026–27 page and was not imported.` });
      continue;
    }
    for (const [id, row] of foldRoster(parseBrefPlayers(item.page.html))) {
      const prior = roster.get(id);
      roster.set(id, prior ? { ...prior, ...Object.fromEntries(Object.entries(row).filter(([, value]) => value != null)) } as Roster : row);
    }
  }
  const readyRoster = [...roster.values()].filter((row) => row.team && row.position);
  messages.push({ level: "info", playerId: null, message: `Basketball Reference roster read: ${readyRoster.length}. Today's board keeps SportsLine matches only.` });

  const recent = new Map<string, { points: number; rebounds: number; games: number }>();
  let recentDays = 0;
  for (const day of fetched.last15) {
    if (!day.page.ok) {
      messages.push({ level: "error", playerId: null, message: `Daily leaders ${day.date} failed: ${day.page.error}` });
      continue;
    }
    const rows = parseBrefPlayers(day.page.html).filter((row) => !row.dnp && row.points != null && row.rebounds != null);
    if (rows.length === 0) continue;
    recentDays++;
    for (const row of rows) {
      const bucket = recent.get(row.playerId) ?? { points: 0, rebounds: 0, games: 0 };
      bucket.points += row.points as number;
      bucket.rebounds += row.rebounds as number;
      bucket.games += 1;
      recent.set(row.playerId, bucket);
    }
  }
  messages.push({ level: "info", playerId: null, message: `Last 15 days: ${recentDays} leader pages.` });

  if (!fetched.sportsline.ok) {
    messages.push({ level: "error", playerId: null, message: `SportsLine failed: ${fetched.sportsline.error}` });
  } else {
    const parsed = parseSportsLine(fetched.sportsline.html);
    let stored = 0;
    const unmatched: string[] = [];
    for (const row of parsed) {
      if (!row.team || !row.away || !row.home) {
        unmatched.push(row.player);
        continue;
      }
      const mapped = idMap.find((item) => item.source === SPORTSLINE && item.entityType === "player" && item.sourceId === row.player);
      const named = readyRoster.filter((player) => player.team === row.team && normalizePersonName(player.name) === normalizePersonName(row.player));
      const rosterRow = mapped ? roster.get(mapped.canonicalId) ?? null : named.length === 1 ? named[0] : null;
      if (!rosterRow || !rosterRow.team || !rosterRow.position) {
        unmatched.push(row.player);
        continue;
      }
      ensureTeam(rosterRow.team);
      const player: Player = {
        playerId: rosterRow.playerId,
        displayName: rosterRow.name,
        teamId: rosterRow.team,
        position: rosterRow.position,
        season: CURRENT_SEASON,
      };
      players = upsertByKey(players, [player], (item) => item.playerId).rows;
      remember(rosterRow.playerId);
      idMap = upsertByKey(
        idMap,
        [{ source: SPORTSLINE, entityType: "player" as const, sourceId: row.player, canonicalId: rosterRow.playerId }],
        (item) => `${item.source}|${item.entityType}|${item.sourceId}`,
      ).rows;
      if (rosterRow.usgPct != null) writeRate(rosterRow.playerId, { usgPct: rosterRow.usgPct, usgGames: rosterRow.usgGames ?? rosterRow.games });
      if (rosterRow.trbPerGame != null && rosterRow.mpPerGame != null && rosterRow.mpPerGame > 0) {
        writeRate(rosterRow.playerId, { rebPerMinute: rosterRow.trbPerGame / rosterRow.mpPerGame, rebPerMinuteGames: rosterRow.games });
      }
      const bucket = recent.get(rosterRow.playerId);
      if (bucket && bucket.games > 0) {
        writeRate(rosterRow.playerId, {
          recentPointsPerGame: bucket.points / bucket.games,
          recentReboundsPerGame: bucket.rebounds / bucket.games,
          recentGames: bucket.games,
        });
      }
      ensureTeam(row.away);
      ensureTeam(row.home);
      const gameId = matchupGameId(slateDate, row.away, row.home);
      ensureGame({
        gameId,
        season: CURRENT_SEASON,
        gameDate: slateDate,
        homeTeamId: row.home,
        awayTeamId: row.away,
        status: "scheduled",
      });
      const projection: OutsideProjection = {
        playerId: rosterRow.playerId,
        gameId,
        source: SPORTSLINE,
        season: CURRENT_SEASON,
        points: row.points,
        rebounds: row.rebounds,
        minutes: row.minutes,
        sourceTimestamp: fetched.retrievedAt,
      };
      projections = upsertByKey(projections, [projection], (item) => `${item.playerId}|${item.gameId}|${item.source}`).rows;
      stored++;
    }
    messages.push({ level: "info", playerId: null, message: `SportsLine projections stored: ${stored}. Rows use ${slateDate}.` });
    if (unmatched.length) {
      messages.push({
        level: "info",
        playerId: null,
        message: `SportsLine names with no single Basketball Reference match on that team: ${unmatched.length}. ${unmatched.slice(0, 8).join(", ")}.`,
      });
    }
  }

  if (!fetched.actuals.ok) {
    messages.push({ level: "error", playerId: null, message: `Daily leaders for ${slateDate} failed: ${fetched.actuals.error}` });
  } else {
    let stored = 0;
    let missingRoster = 0;
    for (const row of parseBrefPlayers(fetched.actuals.html)) {
      if (!row.team || !row.opponent) continue;
      const away = row.location === "@" ? row.team : row.opponent;
      const home = row.location === "@" ? row.opponent : row.team;
      ensureTeam(away);
      ensureTeam(home);
      const gameId = matchupGameId(slateDate, away, home);
      ensureGame({ gameId, season: CURRENT_SEASON, gameDate: slateDate, homeTeamId: home, awayTeamId: away, status: "final" });
      if (!players.some((player) => player.playerId === row.playerId)) {
        missingRoster++;
        continue;
      }
      const actual: Actual = {
        playerId: row.playerId,
        gameId,
        season: CURRENT_SEASON,
        dnp: row.dnp,
        points: row.dnp ? null : row.points,
        rebounds: row.dnp ? null : row.rebounds,
        sourceTimestamp: fetched.retrievedAt,
      };
      actuals = upsertByKey(actuals, [actual], (item) => `${item.playerId}|${item.gameId}`).rows;
      stored++;
    }
    messages.push({ level: "info", playerId: null, message: `Daily leaders actuals stored: ${stored}. ${missingRoster} rows had no roster id and were skipped.` });
  }

  if (!fetched.hashtag.ok) {
    messages.push({ level: "error", playerId: null, message: `Hashtag Basketball failed: ${fetched.hashtag.error}` });
  } else if (!pageIsCurrentSeason(fetched.hashtag.html)) {
    messages.push({ level: "error", playerId: null, message: "Hashtag Basketball did not identify the 2026–27 season and was not imported." });
  } else {
    const parsed = parseHashtag(fetched.hashtag.html);
    const byPosition = new Map<string, { points: number[]; rebounds: number[] }>();
    for (const row of parsed) {
      const bucket = byPosition.get(row.position) ?? { points: [], rebounds: [] };
      bucket.points.push(row.pointsAllowed);
      bucket.rebounds.push(row.reboundsAllowed);
      byPosition.set(row.position, bucket);
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const incoming: Dvp[] = [];
    for (const row of parsed) {
      if (!isPosition(row.position)) continue;
      const bucket = byPosition.get(row.position);
      if (!bucket || bucket.points.length === 0) continue;
      ensureTeam(row.team);
      incoming.push({
        teamId: row.team,
        position: row.position,
        season: CURRENT_SEASON,
        pointsDiff: row.pointsAllowed - mean(bucket.points),
        reboundsDiff: row.reboundsAllowed - mean(bucket.rebounds),
        sourceTimestamp: fetched.retrievedAt,
      });
    }
    dvp = upsertByKey(dvp, incoming, (row) => `${row.teamId}|${row.position}`).rows;
    messages.push({ level: "info", playerId: null, message: `Hashtag defense vs position rows stored: ${incoming.length}.` });
  }

  return {
    db: { ...db, teams, players, games, idMap, rates, projections, dvp, actuals },
    messages,
  };
}
