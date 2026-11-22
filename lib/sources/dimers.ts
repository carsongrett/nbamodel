import { chicagoDateOf, CURRENT_SEASON } from "../engine";
import { parseSportsLine } from "./parsers";
import { canonicalTeam } from "./teams";

/** Public JSON behind the Dimers projections page. The HTML table is locked; this feed is not. */
export const DIMERS_OPTIONS_URL = "https://levy-edge.statsinsider.com.au/round/options?Sport=NBA";

export function dimersBoxUrl(round: number, season: number): string {
  return `https://levy-edge.statsinsider.com.au/round/boxscores?Sport=NBA&Round=${round}&Season=${season}`;
}

export function dimersSeasonYear(season = CURRENT_SEASON): number {
  const year = Number(season.slice(0, 4));
  return Number.isInteger(year) ? year : 2026;
}

export type DimersRoundOption = { year: number; round: number; date: string };

export type DimersPlayer = {
  name: string;
  team: string;
  away: string;
  home: string;
  points: number | null;
  rebounds: number | null;
};

export type DimersGame = {
  away: string;
  home: string;
  startsAt: string;
  players: DimersPlayer[];
};

export type DimersFetch =
  | { ok: true; round: number; season: number; players: DimersPlayer[] }
  | { ok: false; error: string };

export type DimersPageFetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

type ProbePlan = { window: number[]; rest: number[] };

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function dayDistance(date: string, slateDate: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [slateYear, slateMonth, slateDay] = slateDate.split("-").map(Number);
  if (![year, month, day, slateYear, slateMonth, slateDay].every(Number.isFinite)) return 9999;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(slateYear, slateMonth - 1, slateDay)) / 86400000);
}

export function parseDimersOptions(body: string): DimersRoundOption[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const rows: DimersRoundOption[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const year = Number(row.Year);
    const round = Number(row.Round_Number);
    const date = typeof row.Round_Date === "string" ? row.Round_Date.slice(0, 10) : "";
    if (!Number.isInteger(year) || !Number.isInteger(round) || round < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rows.push({ year, round, date });
  }
  return rows;
}

function teamAbbr(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const abbr = (value as { Abv?: unknown }).Abv;
  return typeof abbr === "string" ? canonicalTeam(abbr) : null;
}

function readPlayers(side: unknown, team: string, away: string, home: string): DimersPlayer[] {
  if (!Array.isArray(side)) return [];
  const players: DimersPlayer[] = [];
  for (const item of side) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const name = `${first} ${last}`.trim();
    if (!name) continue;
    players.push({
      name,
      team,
      away,
      home,
      points: finiteNumber(row.points),
      rebounds: finiteNumber(row.rebounds),
    });
  }
  return players;
}

export function parseDimersBoxscores(body: string): DimersGame[] | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const games: DimersGame[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const match = row.MatchData;
    if (!match || typeof match !== "object") continue;
    const matchRow = match as Record<string, unknown>;
    const away = teamAbbr(matchRow.AwayTeam);
    const home = teamAbbr(matchRow.HomeTeam);
    const startsAt = typeof matchRow.Date === "string" ? matchRow.Date : "";
    if (!away || !home || !startsAt) continue;
    const box = row.projBoxScore;
    const sides = box && typeof box === "object" ? box as Record<string, unknown> : {};
    games.push({
      away,
      home,
      startsAt,
      players: [...readPlayers(sides.away, away, away, home), ...readPlayers(sides.home, home, away, home)],
    });
  }
  return games;
}

/** Round numbers skip. A missing number is probed and a 404 does not end the search. */
export function probeRoundNumbers(options: DimersRoundOption[], slateDate: string, seasonYear: number): ProbePlan {
  const slateYear = Number(slateDate.slice(0, 4));
  const years = new Set([seasonYear, slateYear].filter((year) => Number.isInteger(year)));
  const season = options.filter((row) => years.has(row.year));
  const exact = season.filter((row) => row.date === slateDate);
  const closest = [...season].sort((a, b) => Math.abs(dayDistance(a.date, slateDate)) - Math.abs(dayDistance(b.date, slateDate)) || a.round - b.round)[0];
  const anchor = exact.length ? exact : closest ? [closest] : [];
  if (anchor.length === 0) return { window: [], rest: [] };
  const low = Math.min(...anchor.map((row) => row.round));
  const high = Math.max(...anchor.map((row) => row.round));
  const window: number[] = [];
  for (let round = Math.max(1, low - 1); round <= high + 1; round++) window.push(round);
  const seen = new Set(window);
  const rest = season
    .filter((row) => !seen.has(row.round))
    .sort((a, b) => Math.abs(dayDistance(a.date, slateDate)) - Math.abs(dayDistance(b.date, slateDate)) || a.round - b.round)
    .map((row) => row.round);
  return { window, rest };
}

export function dimersRoundMatches(games: DimersGame[], slateDate: string, wanted: Set<string>): boolean {
  const dated = games.filter((game) => chicagoDateOf(game.startsAt) === slateDate);
  if (dated.length === 0) return false;
  if (wanted.size === 0) return true;
  const keys = new Set(dated.map((game) => `${game.away}@${game.home}`));
  let overlap = 0;
  for (const key of wanted) if (keys.has(key)) overlap++;
  if (overlap === 0) return false;
  const coversWanted = overlap === wanted.size;
  const roundCovered = [...keys].every((key) => wanted.has(key));
  return coversWanted || roundCovered;
}

function projectedMatchups(sportslineHtml: string, espnGames: { away: string; home: string }[]): Set<string> {
  const keys = new Set<string>();
  for (const row of parseSportsLine(sportslineHtml)) {
    if (row.away && row.home) keys.add(`${row.away}@${row.home}`);
  }
  for (const game of espnGames) {
    const away = canonicalTeam(game.away);
    const home = canonicalTeam(game.home);
    if (away && home) keys.add(`${away}@${home}`);
  }
  return keys;
}

const JSON_HEADERS = { accept: "application/json", "user-agent": "nbamodel personal desk" };
const REST_PROBE_CAP = 10;

export async function fetchDimersSlate(
  slateDate: string,
  sportslineHtml: string,
  espnGames: { away: string; home: string }[],
  fetchPage: DimersPageFetch,
): Promise<DimersFetch> {
  let optionsBody: string;
  try {
    const response = await fetchPage(DIMERS_OPTIONS_URL, { headers: JSON_HEADERS });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    optionsBody = await response.text();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Fetch failed." };
  }
  const options = parseDimersOptions(optionsBody);
  if (options.length === 0) return { ok: false, error: "Round list was empty." };
  const seasonYear = dimersSeasonYear();
  const plan = probeRoundNumbers(options, slateDate, seasonYear);
  if (plan.window.length === 0) return { ok: false, error: "No NBA rounds for this season." };
  const wanted = projectedMatchups(sportslineHtml, espnGames);
  const years = new Set([seasonYear, Number(slateDate.slice(0, 4))].filter((year) => Number.isInteger(year)));
  const seasonFor = (round: number) => options.find((row) => row.round === round && years.has(row.year))?.year ?? seasonYear;

  const pull = async (round: number): Promise<DimersFetch | null> => {
    let body: string;
    try {
      const response = await fetchPage(dimersBoxUrl(round, seasonFor(round)), { headers: JSON_HEADERS });
      if (!response.ok) return null;
      body = await response.text();
    } catch {
      return null;
    }
    const games = parseDimersBoxscores(body);
    if (!games || !dimersRoundMatches(games, slateDate, wanted)) return null;
    const players = games
      .filter((game) => chicagoDateOf(game.startsAt) === slateDate)
      .flatMap((game) => game.players);
    return { ok: true, round, season: seasonFor(round), players };
  };

  for (const round of plan.window) {
    const found = await pull(round);
    if (found) return found;
  }
  for (const round of plan.rest.slice(0, REST_PROBE_CAP)) {
    const found = await pull(round);
    if (found) return found;
  }
  return { ok: false, error: "No slate matched the games being projected." };
}
