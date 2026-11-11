import { CURRENT_SEASON, idsEqual, mergeGame, upsertByKey, type Database, type Game, type IdMap, type ModelMessage, type PropLine, type Stat } from "../engine";
import { POINTS_MARKET_ID, POINTS_REBOUNDS_MARKET_ID, REBOUNDS_MARKET_ID, type ProbeResult } from "./bettingpros";
import { normalizePersonName } from "./names";
import { canonicalTeam, matchupGameId } from "./teams";

const STAT_BY_MARKET: Record<number, Stat> = {
  [POINTS_MARKET_ID]: "points",
  [REBOUNDS_MARKET_ID]: "rebounds",
  [POINTS_REBOUNDS_MARKET_ID]: "points_rebounds",
};

export function applyBettingProsProbe(db: Database, date: string, probe: ProbeResult, retrievedAt: string): { db: Database; messages: ModelMessage[] } {
  const messages: ModelMessage[] = [{ level: probe.state === "error" || probe.state === "unparsed" ? "error" : "info", playerId: null, message: probe.message }];
  if (probe.state !== "parsed") return { db, messages };
  let teams = db.teams.slice();
  let games = db.games.slice();
  let lines = db.lines.slice();
  let idMap = db.idMap.slice();
  const gameByEvent = new Map<string, string>();
  const ensureTeam = (teamId: string) => {
    if (!teams.some((team) => team.teamId === teamId)) teams = [...teams, { teamId, name: teamId }];
  };
  for (const event of probe.events) {
    const home = event.home ? canonicalTeam(event.home) : null;
    const away = event.away ? canonicalTeam(event.away) : null;
    if (!home || !away) continue;
    ensureTeam(home);
    ensureTeam(away);
    const gameId = matchupGameId(date, away, home);
    gameByEvent.set(event.id, gameId);
    const game: Game = { gameId, season: CURRENT_SEASON, gameDate: date, homeTeamId: home, awayTeamId: away, status: "scheduled" };
    const existing = games.find((row) => row.gameId === gameId);
    games = upsertByKey(games, [mergeGame(existing, game)], (row) => row.gameId).rows;
  }
  let stored = 0;
  let unmapped = 0;
  for (const offer of probe.offers) {
    if (offer.line == null || !offer.eventId) continue;
    const stat = offer.marketId == null ? undefined : STAT_BY_MARKET[offer.marketId];
    const gameId = gameByEvent.get(offer.eventId);
    const game = gameId ? games.find((row) => row.gameId === gameId) : undefined;
    const mapped = offer.playerId
      ? idMap.find((item) => item.source === "bettingpros" && item.entityType === "player" && item.sourceId === offer.playerId)
      : undefined;
    let playerId = mapped?.canonicalId ?? null;
    if (!playerId && offer.name && game) {
      const key = normalizePersonName(offer.name);
      const sides = new Set([game.homeTeamId, game.awayTeamId]);
      const hits = db.players.filter((player) => sides.has(player.teamId) && normalizePersonName(player.displayName) === key);
      if (hits.length === 1) playerId = hits[0].playerId;
    }
    if (!gameId || !playerId || !stat) {
      unmapped++;
      continue;
    }
    const finished = db.actuals.some((row) => idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId));
    if (finished) continue;
    if (!mapped && (offer.playerId || offer.name)) {
      const row: IdMap = {
        source: "bettingpros",
        entityType: "player",
        sourceId: offer.playerId ?? offer.name ?? playerId,
        canonicalId: playerId,
      };
      idMap = upsertByKey(idMap, [row], (item) => `${item.source}|${item.entityType}|${item.sourceId}`).rows;
    }
    const prior = lines.find((row) => idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId) && row.stat === stat);
    const line: PropLine = {
      playerId,
      gameId,
      stat,
      season: CURRENT_SEASON,
      line: offer.line,
      overOdds: offer.overOdds,
      underOdds: offer.underOdds,
      source: "bettingpros",
      sourceTimestamp: retrievedAt,
      units: prior?.units ?? null,
      unitDollars: prior?.unitDollars ?? null,
    };
    lines = upsertByKey(lines, [line], (row) => `${row.playerId}|${row.gameId}|${row.stat}`).rows;
    stored++;
  }
  if (probe.offers.length) {
    messages.push({
      level: "info",
      playerId: null,
      message: `Consensus lines stored: ${stored}. Unmatched names or markets: ${unmapped}.`,
    });
  }
  return { db: { ...db, teams, games, lines, idMap }, messages };
}
