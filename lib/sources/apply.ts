import {
  CURRENT_SEASON,
  POSITIONS,
  defenseVsPosition,
  mergeGame,
  opponentReboundDiffs,
  upsertByKey,
  type Actual,
  type Database,
  type Dvp,
  type Game,
  type IdMap,
  type ModelMessage,
  type OppRebound,
  type OutsideProjection,
  type Player,
  type PlayerRate,
  type Position,
  type Team,
} from "../engine";
import { normalizePersonName } from "./names";
import type { DimersFetch, DimersPlayer } from "./dimers";
import { pageIsCurrentSeason, pageMentionsCurrentSeason, parseBrefPlayers, parseFanduelDefense, parseSportsLine, parseTeamPace, parseTeamRankingsOppRebounds, type BrefPlayerRow } from "./parsers";
import { matchupGameId } from "./teams";

export const BREF = "basketball-reference";
export const SPORTSLINE = "sportsline";
export const DIMERS = "dimers";

export type FetchedPage = { url: string; ok: true; html: string } | { url: string; ok: false; error: string };

export type PublicFetch = {
  advanced: FetchedPage;
  perGame: FetchedPage;
  pace: FetchedPage;
  last15: { date: string; page: FetchedPage }[];
  actuals: FetchedPage;
  sportsline: FetchedPage;
  fantasypros: FetchedPage;
  teamrankings: FetchedPage;
  /** Absent on older fetches. A failed fetch keeps SportsLine as the baseline. */
  dimers?: DimersFetch;
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
      projectionInputs: (db.projectionInputs ?? []).filter((row) => !samplePlayer(row.playerId) && !sampleGame(row.gameId)),
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
  let pace = db.pace.slice();
  let oppRebounds = db.oppRebounds.slice();
  let actuals = db.actuals.slice();

  const ensureTeam = (teamId: string) => {
    if (teams.some((team) => team.teamId === teamId)) return;
    teams = upsertByKey(teams, [{ teamId, name: teamId }], (team: Team) => team.teamId).rows;
  };
  const ensureGame = (game: Game) => {
    const existing = games.find((row) => row.gameId === game.gameId);
    games = upsertByKey(games, [mergeGame(existing, game)], (row) => row.gameId).rows;
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
  const storeLeaderActuals = (html: string, date: string, createGames: boolean) => {
    let stored = 0;
    let missingRoster = 0;
    for (const row of parseBrefPlayers(html)) {
      if (!row.team || !row.opponent) continue;
      const away = row.location === "@" ? row.team : row.opponent;
      const home = row.location === "@" ? row.opponent : row.team;
      const gameId = matchupGameId(date, away, home);
      if (!createGames && !games.some((game) => game.gameId === gameId)) continue;
      ensureTeam(away);
      ensureTeam(home);
      ensureGame({
        gameId,
        season: CURRENT_SEASON,
        gameDate: date,
        homeTeamId: home,
        awayTeamId: away,
        status: "final",
      });
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
    return { stored, missingRoster };
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
  if (!fetched.pace.ok) {
    messages.push({ level: "error", playerId: null, message: `Basketball Reference team pace failed: ${fetched.pace.error}` });
  } else if (!pageIsCurrentSeason(fetched.pace.html)) {
    messages.push({ level: "error", playerId: null, message: "Basketball Reference team pace is not a 2026–27 page and was not imported." });
  } else {
    const rows = parseTeamPace(fetched.pace.html);
    if (rows.length === 0) {
      messages.push({ level: "error", playerId: null, message: "Basketball Reference team pace table had no teams." });
    } else {
      const league = rows.reduce((sum, row) => sum + row.pace, 0) / rows.length;
      pace = upsertByKey(
        pace,
        rows.map((row) => ({
          teamId: row.team,
          season: CURRENT_SEASON,
          pace: row.pace,
          paceDiff: row.pace - league,
          sourceTimestamp: fetched.retrievedAt,
        })),
        (row) => row.teamId,
      ).rows;
      messages.push({ level: "info", playerId: null, message: `Team pace stored: ${rows.length}. League pace ${Math.round(league * 10) / 10}.` });
    }
  }

  const readyRoster = [...roster.values()].filter((row) => row.team && row.position);
  messages.push({ level: "info", playerId: null, message: `Basketball Reference roster read: ${readyRoster.length}. Today's board keeps SportsLine and Dimers matches.` });

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

  const onSlate = (gameId: string) => gameId.startsWith(`${slateDate}|`);
  if (fetched.dimers && !fetched.dimers.ok) {
    projections = projections.filter((row) => !(row.source === DIMERS && onSlate(row.gameId)));
    const reason = fetched.dimers.error ? ` (${fetched.dimers.error})` : "";
    messages.push({
      level: "info",
      playerId: null,
      message: `Dimers did not load${reason}. SportsLine stays the baseline.`,
    });
  } else if (fetched.dimers?.ok) {
    projections = projections.filter((row) => !(row.source === DIMERS && onSlate(row.gameId)));
    let stored = 0;
    const unmatched: string[] = [];
    const covered = new Set<string>();
    const storeDimers = (row: DimersPlayer) => {
      if (!row.team || !row.away || !row.home) {
        unmatched.push(row.name);
        return;
      }
      const sourceId = `${row.team}|${row.name}`;
      const mapped = idMap.find((item) => item.source === DIMERS && item.entityType === "player" && item.sourceId === sourceId);
      const named = readyRoster.filter((player) => player.team === row.team && normalizePersonName(player.name) === normalizePersonName(row.name));
      const rosterRow = mapped ? roster.get(mapped.canonicalId) ?? null : named.length === 1 ? named[0] : null;
      if (!rosterRow || !rosterRow.team || !rosterRow.position) {
        unmatched.push(row.name);
        return;
      }
      ensureTeam(rosterRow.team);
      ensureTeam(row.away);
      ensureTeam(row.home);
      players = upsertByKey(players, [{
        playerId: rosterRow.playerId,
        displayName: rosterRow.name,
        teamId: rosterRow.team,
        position: rosterRow.position,
        season: CURRENT_SEASON,
      }], (item) => item.playerId).rows;
      remember(rosterRow.playerId);
      idMap = upsertByKey(
        idMap,
        [{ source: DIMERS, entityType: "player" as const, sourceId, canonicalId: rosterRow.playerId }],
        (item) => `${item.source}|${item.entityType}|${item.sourceId}`,
      ).rows;
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
        source: DIMERS,
        season: CURRENT_SEASON,
        points: row.points,
        rebounds: row.rebounds,
        minutes: null,
        sourceTimestamp: fetched.retrievedAt,
      };
      const key = `${rosterRow.playerId}|${gameId}`;
      const already = covered.has(key);
      projections = upsertByKey(projections, [projection], (item) => `${item.playerId}|${item.gameId}|${item.source}`).rows;
      covered.add(key);
      if (!already && (row.points != null || row.rebounds != null)) stored++;
    };
    for (const row of fetched.dimers.players) {
      if (row.points == null && row.rebounds == null) continue;
      storeDimers(row);
    }
    let missed = 0;
    const sportslineRows = projections.filter((row) => row.source === SPORTSLINE && onSlate(row.gameId));
    for (const row of sportslineRows) {
      const key = `${row.playerId}|${row.gameId}`;
      if (covered.has(key)) continue;
      const blank: OutsideProjection = {
        playerId: row.playerId,
        gameId: row.gameId,
        source: DIMERS,
        season: CURRENT_SEASON,
        points: null,
        rebounds: null,
        minutes: null,
        sourceTimestamp: fetched.retrievedAt,
      };
      projections = upsertByKey(projections, [blank], (item) => `${item.playerId}|${item.gameId}|${item.source}`).rows;
      covered.add(key);
      missed++;
    }
    messages.push({
      level: "info",
      playerId: null,
      message: `Dimers round ${fetched.dimers.round} projections stored: ${stored}.`,
    });
    if (missed) {
      messages.push({
        level: "info",
        playerId: null,
        message: `Dimers missed ${missed} SportsLine player${missed === 1 ? "" : "s"} on this slate. SportsLine is the full baseline for those rows.`,
      });
    }
    if (unmatched.length) {
      messages.push({
        level: "info",
        playerId: null,
        message: `Dimers names with no single Basketball Reference match on that team: ${unmatched.length}. ${unmatched.slice(0, 8).join(", ")}.`,
      });
    }
  }

  if (!fetched.actuals.ok) {
    messages.push({ level: "error", playerId: null, message: `Daily leaders for ${slateDate} failed: ${fetched.actuals.error}` });
  } else {
    const result = storeLeaderActuals(fetched.actuals.html, slateDate, true);
    messages.push({ level: "info", playerId: null, message: `Daily leaders actuals stored: ${result.stored}. ${result.missingRoster} rows had no roster id and were skipped.` });
  }

  let priorStored = 0;
  let priorDates = 0;
  for (const day of fetched.last15) {
    if (!day.page.ok) continue;
    const result = storeLeaderActuals(day.page.html, day.date, false);
    if (result.stored > 0) {
      priorStored += result.stored;
      priorDates += 1;
    }
  }
  if (priorStored > 0) {
    const results = priorStored === 1 ? "1 result" : `${priorStored} results`;
    const dates = priorDates === 1 ? "1 earlier date" : `${priorDates} earlier dates`;
    messages.push({
      level: "info",
      playerId: null,
      message: `Basketball Reference leaders graded ${results} on ${dates} already on the desk.`,
    });
  }

  if (!fetched.fantasypros.ok) {
    messages.push({ level: "error", playerId: null, message: `FantasyPros defense vs position failed: ${fetched.fantasypros.error}` });
  } else if (!pageMentionsCurrentSeason(fetched.fantasypros.html)) {
    messages.push({ level: "error", playerId: null, message: "FantasyPros defense vs position did not identify the 2026–27 season and was not imported." });
  } else {
    const parsed = parseFanduelDefense(fetched.fantasypros.html);
    const diffs = defenseVsPosition(
      parsed.l30.map((row) => ({ teamId: row.team, position: row.position, points: row.points, rebounds: row.rebounds })),
      parsed.l15.map((row) => ({ teamId: row.team, position: row.position, points: row.points, rebounds: row.rebounds })),
    );
    if (diffs.length === 0) {
      messages.push({ level: "error", playerId: null, message: "FantasyPros defense vs position had no last-15 or last-30 rows." });
    } else {
      const incoming: Dvp[] = diffs.map((row) => {
        ensureTeam(row.teamId);
        return {
          teamId: row.teamId,
          position: row.position,
          season: CURRENT_SEASON,
          pointsDiff: row.pointsDiff,
          reboundsDiff: row.reboundsDiff,
          pointsWindow: row.pointsWindow,
          reboundsWindow: row.reboundsWindow,
          sourceTimestamp: fetched.retrievedAt,
        };
      });
      dvp = upsertByKey(dvp, incoming, (row) => `${row.teamId}|${row.position}`).rows;
      const partial = incoming.filter((row) => row.pointsWindow !== "both" || row.reboundsWindow !== "both").length;
      const note = partial ? ` ${partial} used one window because the other was missing.` : "";
      messages.push({ level: "info", playerId: null, message: `FantasyPros defense vs position rows stored: ${incoming.length}.${note}` });
    }
  }

  if (!fetched.teamrankings.ok) {
    messages.push({ level: "error", playerId: null, message: `TeamRankings opponent rebounds failed: ${fetched.teamrankings.error}` });
  } else if (!pageMentionsCurrentSeason(fetched.teamrankings.html)) {
    messages.push({ level: "error", playerId: null, message: "TeamRankings opponent rebounds did not identify the 2026–27 season and was not imported." });
  } else {
    const parsed = parseTeamRankingsOppRebounds(fetched.teamrankings.html);
    const diffs = opponentReboundDiffs(parsed.map((row) => ({ teamId: row.team, season: row.season, last3: row.last3 })));
    if (diffs.length === 0) {
      messages.push({ level: "error", playerId: null, message: "TeamRankings opponent rebounds table had no season and Last 3 rows." });
    } else {
      const incoming: OppRebound[] = diffs.map((row) => {
        ensureTeam(row.teamId);
        return {
          teamId: row.teamId,
          season: CURRENT_SEASON,
          reboundDiff: row.reboundDiff,
          sourceTimestamp: fetched.retrievedAt,
        };
      });
      oppRebounds = upsertByKey(oppRebounds, incoming, (row) => row.teamId).rows;
      messages.push({ level: "info", playerId: null, message: `TeamRankings opponent rebounds stored: ${incoming.length}.` });
    }
  }

  return {
    db: { ...db, teams, players, games, idMap, rates, projections, dvp, pace, oppRebounds, actuals },
    messages,
  };
}
