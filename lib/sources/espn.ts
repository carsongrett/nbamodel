import { chicagoDateOf, CURRENT_SEASON, mergeGame, upsertByKey, type Database, type Game, type ModelMessage, type Vegas } from "../engine";
import { canonicalTeam, matchupGameId } from "./teams";

export const ESPN_ODDS_URL = "https://www.espn.com/nba/odds";

const SLUGS: Record<string, string> = {
  gs: "GSW",
  no: "NOP",
  ny: "NYK",
  phx: "PHX",
  sa: "SAS",
  utah: "UTA",
  wsh: "WAS",
};

export type EspnGameOdds = {
  away: string;
  home: string;
  /** Home team's signed spread. Negative means the home team is favored. */
  spread: number;
  total: number;
  /** Tip timestamp copied from the odds card, including its offset. */
  tip: string;
};

export type EspnOddsResult =
  | { ok: true; games: EspnGameOdds[]; message: string }
  | { ok: false; detail: string };

function teamFromSlug(slug: string): string | null {
  const mapped = SLUGS[slug] ?? slug.toUpperCase();
  return canonicalTeam(mapped);
}

function spreadValue(text: string): number | null {
  const cleaned = text.trim();
  if (/^(pk|even)$/i.test(cleaned)) return 0;
  if (/^[ou]/i.test(cleaned)) return null;
  const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function totalValue(text: string): number | null {
  const match = text.trim().match(/^[ou]([+-]?\d+(?:\.\d+)?)$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function labeled(card: string, label: string): string[] {
  const pattern = new RegExp(`aria-label="${label}[^"]*"[\\s\\S]*?data-testid="OddsCell"[^>]*>\\s*<div[^>]*>([^<]+)`, "g");
  return [...card.matchAll(pattern)].map((match) => match[1].trim());
}

export function parseEspnOdds(html: string, slateDate: string): { games: EspnGameOdds[]; parsed: boolean } {
  if (!html.includes('data-testid="betSixPackTable"')) return { games: [], parsed: false };
  const cards = html.split('data-testid="betSixPackTable-item-').slice(1);
  if (cards.length === 0) return { games: [], parsed: false };
  const games: EspnGameOdds[] = [];
  let dated = 0;
  for (const card of cards) {
    const tip = card.match(/data-game-link="true">(\d{4}-\d{2}-\d{2}T[^<]+)/)?.[1];
    if (!tip || chicagoDateOf(tip) !== slateDate) continue;
    dated++;
    const slugs = [...card.matchAll(/\/nba\/team\/_\/name\/([a-z0-9]+)\//g)].map((match) => match[1]);
    const away = slugs[0] ? teamFromSlug(slugs[0]) : null;
    const home = slugs[1] ? teamFromSlug(slugs[1]) : null;
    const spreads = labeled(card, "pointSpread").map(spreadValue).filter((value): value is number => value != null);
    const totals = labeled(card, "total").map(totalValue).filter((value): value is number => value != null);
    if (!away || !home || spreads.length < 2 || totals.length === 0) continue;
    const [awaySpread, homeSpread] = spreads;
    if (Math.abs(awaySpread + homeSpread) > 0.01) continue;
    if (totals.some((total) => total !== totals[0])) continue;
    games.push({ away, home, spread: homeSpread, total: totals[0], tip });
  }
  if (dated > 0 && games.length === 0) return { games: [], parsed: false };
  return { games, parsed: true };
}

type PageFetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function fetchEspnOdds(date: string, fetchImpl?: PageFetch): Promise<EspnOddsResult> {
  const fetchPage: PageFetch = fetchImpl ?? (async (url, init) => {
    const response = await fetch(url, { headers: init.headers, signal: AbortSignal.timeout(20000) });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  let response: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    response = await fetchPage(ESPN_ODDS_URL, { headers: { accept: "text/html", "user-agent": "nbamodel personal desk" } });
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "ESPN odds call failed." };
  }
  if (!response.ok) return { ok: false, detail: `HTTP ${response.status}` };
  const parsed = parseEspnOdds(await response.text(), date);
  if (!parsed.parsed) return { ok: false, detail: "ESPN odds page did not match the parser." };
  const games = parsed.games.length === 1 ? "1 game" : `${parsed.games.length} games`;
  return { ok: true, games: parsed.games, message: `ESPN spread and total stored for ${games} on ${date}.` };
}

export function applyEspnOdds(db: Database, date: string, gamesOdds: EspnGameOdds[], retrievedAt: string): { db: Database; messages: ModelMessage[] } {
  let teams = db.teams.slice();
  let games = db.games.slice();
  let vegas = db.vegas.slice();
  const ensureTeam = (teamId: string) => {
    if (!teams.some((team) => team.teamId === teamId)) teams = [...teams, { teamId, name: teamId }];
  };
  for (const row of gamesOdds) {
    const home = canonicalTeam(row.home);
    const away = canonicalTeam(row.away);
    if (!home || !away) continue;
    ensureTeam(home);
    ensureTeam(away);
    const gameId = matchupGameId(date, away, home);
    const game: Game = { gameId, season: CURRENT_SEASON, gameDate: date, homeTeamId: home, awayTeamId: away, status: "scheduled", tipAt: row.tip };
    const existing = games.find((item) => item.gameId === gameId);
    games = upsertByKey(games, [mergeGame(existing, game)], (item) => item.gameId).rows;
    const lines: Vegas[] = [
      { gameId, teamId: home, season: CURRENT_SEASON, spread: row.spread, total: row.total, sourceTimestamp: retrievedAt },
      { gameId, teamId: away, season: CURRENT_SEASON, spread: -row.spread, total: row.total, sourceTimestamp: retrievedAt },
    ];
    vegas = upsertByKey(vegas, lines, (item) => `${item.gameId}|${item.teamId}`).rows;
  }
  const count = gamesOdds.length === 1 ? "1 game" : `${gamesOdds.length} games`;
  return {
    db: { ...db, teams, games, vegas },
    messages: [{ level: "info", playerId: null, message: `ESPN spread and total stored for ${count} on ${date}.` }],
  };
}
