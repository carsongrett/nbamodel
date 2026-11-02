import { CURRENT_SEASON, upsertByKey, type Database, type Game, type ModelMessage, type PropLine, type Vegas } from "../engine";
import type { ProbeResult } from "./bettingpros";
import { canonicalTeam, matchupGameId } from "./teams";

export function applyBettingProsProbe(db: Database, date: string, probe: ProbeResult, retrievedAt: string): { db: Database; messages: ModelMessage[] } {
  const messages: ModelMessage[] = [{ level: probe.state === "error" || probe.state === "unparsed" ? "error" : "info", playerId: null, message: probe.message }];
  if (probe.state !== "parsed") return { db, messages };
  let teams = db.teams.slice();
  let games = db.games.slice();
  let vegas = db.vegas.slice();
  let lines = db.lines.slice();
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
    games = upsertByKey(games, [existing?.status === "final" ? { ...game, status: "final" as const } : game], (row) => row.gameId).rows;
    if (event.spread == null || event.total == null) continue;
    const rows: Vegas[] = [
      { gameId, teamId: home, season: CURRENT_SEASON, spread: event.spread, total: event.total, sourceTimestamp: retrievedAt },
      { gameId, teamId: away, season: CURRENT_SEASON, spread: -event.spread, total: event.total, sourceTimestamp: retrievedAt },
    ];
    vegas = upsertByKey(vegas, rows, (row) => `${row.gameId}|${row.teamId}`).rows;
  }
  let stored = 0;
  let unmapped = 0;
  for (const offer of probe.offers) {
    if (offer.line == null || !offer.playerId || !offer.eventId) continue;
    const gameId = gameByEvent.get(offer.eventId);
    const mapped = db.idMap.find((item) => item.source === "bettingpros" && item.entityType === "player" && item.sourceId === offer.playerId);
    if (!gameId || !mapped) {
      unmapped++;
      continue;
    }
    const line: PropLine = {
      playerId: mapped.canonicalId,
      gameId,
      stat: "points",
      season: CURRENT_SEASON,
      line: offer.line,
      overOdds: offer.overOdds,
      underOdds: offer.underOdds,
      source: "bettingpros",
      sourceTimestamp: retrievedAt,
    };
    lines = upsertByKey(lines, [line], (row) => `${row.playerId}|${row.gameId}|${row.stat}`).rows;
    stored++;
  }
  if (probe.offers.length) {
    messages.push({
      level: "info",
      playerId: null,
      message: `Points lines stored from the one offers page: ${stored}. Unmapped or unmatched: ${unmapped}. Rebounds and points-plus-rebounds were not requested.`,
    });
  }
  return { db: { ...db, teams, games, vegas, lines }, messages };
}
