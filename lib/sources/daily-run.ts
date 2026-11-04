import { applyModelRun, CURRENT_SEASON, type Database, type ModelMessage } from "../engine";
import { applyPublicPages, type FetchedPage, type PublicFetch } from "./apply";
import { applyBettingProsProbe } from "./apply-bettingpros";
import { fetchBettingProsDay, type ProbeResult } from "./bettingpros";
import { fetchDimersSlate } from "./dimers";
import { applyEspnOdds, fetchEspnOdds, type EspnGameOdds } from "./espn";
import { pageIsCurrentSeason, pageMentionsCurrentSeason } from "./parsers";
import { dailyLeadersUrl, shiftDate } from "./teams";

const ADVANCED_URL = "https://www.basketball-reference.com/leagues/NBA_2027_advanced.html";
const PER_GAME_URL = "https://www.basketball-reference.com/leagues/NBA_2027_per_game.html";
const LEAGUE_URL = "https://www.basketball-reference.com/leagues/NBA_2027.html";
const SPORTSLINE_URL = "https://www.sportsline.com/nba/expert-projections/simulation/";
export const FANTASYPROS_DVP_URL = "https://www.fantasypros.com/daily-fantasy/nba/fanduel-defense-vs-position.php";
export const TEAMRANKINGS_OPP_REBOUNDS_URL = "https://www.teamrankings.com/nba/stat/opponent-total-rebounds-per-game";

export type PageResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type PageFetch = (url: string, init: { headers: Record<string, string> }) => Promise<PageResponse>;

export type DailyFailure = { ok: false; source: string; detail: string };
export type ProjectionSuccess = { ok: true; fetched: PublicFetch; espn: EspnGameOdds[]; savedAt: string };
export type ProjectionCollected = ProjectionSuccess | DailyFailure;

function failed(source: string, detail: string): DailyFailure {
  return { ok: false, source, detail };
}

async function pull(fetchPage: PageFetch, source: string, url: string, headers: Record<string, string>): Promise<{ ok: true; html: string } | DailyFailure> {
  try {
    const response = await fetchPage(url, { headers });
    if (!response.ok) return failed(source, `HTTP ${response.status}`);
    return { ok: true, html: await response.text() };
  } catch (error) {
    return failed(source, error instanceof Error ? error.message : "Fetch failed.");
  }
}

function seasonPage(source: string, html: string): DailyFailure | null {
  if (pageIsCurrentSeason(html)) return null;
  return failed(source, "The page is not the 2026–27 season.");
}

function publishedSeason(source: string, html: string): DailyFailure | null {
  if (pageMentionsCurrentSeason(html)) return null;
  return failed(source, `The page is not the ${CURRENT_SEASON} season.`);
}

function page(url: string, html: string): FetchedPage {
  return { url, ok: true, html };
}

export async function collectProjectionSources(date: string, savedAt: string, fetchImpl?: PageFetch): Promise<ProjectionCollected> {
  const fetchPage: PageFetch = fetchImpl ?? (async (url, init) => {
    const response = await fetch(url, { headers: init.headers, signal: AbortSignal.timeout(20000) });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  const espn = await fetchEspnOdds(date, fetchPage);
  if (!espn.ok) return failed("ESPN odds", espn.detail);

  const htmlHeaders = { accept: "text/html", "user-agent": "nbamodel personal desk" };
  const usage = await pull(fetchPage, "Basketball Reference usage", ADVANCED_URL, htmlHeaders);
  if (!usage.ok) return usage;
  const usageSeason = seasonPage("Basketball Reference usage", usage.html);
  if (usageSeason) return usageSeason;

  const perGame = await pull(fetchPage, "Basketball Reference rebounds per minute", PER_GAME_URL, htmlHeaders);
  if (!perGame.ok) return perGame;
  const perGameSeason = seasonPage("Basketball Reference rebounds per minute", perGame.html);
  if (perGameSeason) return perGameSeason;

  const last15: PublicFetch["last15"] = [];
  for (let ago = 1; ago <= 15; ago++) {
    const day = shiftDate(date, -ago);
    const leaders = await pull(fetchPage, `Basketball Reference last 15 for ${day}`, dailyLeadersUrl(day), htmlHeaders);
    if (!leaders.ok) return leaders;
    last15.push({ date: day, page: page(dailyLeadersUrl(day), leaders.html) });
  }

  const pace = await pull(fetchPage, "Basketball Reference pace", LEAGUE_URL, htmlHeaders);
  if (!pace.ok) return pace;
  const paceSeason = seasonPage("Basketball Reference pace", pace.html);
  if (paceSeason) return paceSeason;

  const boxScores = await pull(fetchPage, `Basketball Reference box scores for ${date}`, dailyLeadersUrl(date), htmlHeaders);
  if (!boxScores.ok) return boxScores;

  const sportsline = await pull(fetchPage, "SportsLine", SPORTSLINE_URL, htmlHeaders);
  if (!sportsline.ok) return sportsline;

  const fantasypros = await pull(fetchPage, "FantasyPros defense vs position", FANTASYPROS_DVP_URL, htmlHeaders);
  if (!fantasypros.ok) return fantasypros;
  const fantasyprosSeason = publishedSeason("FantasyPros defense vs position", fantasypros.html);
  if (fantasyprosSeason) return fantasyprosSeason;

  const teamrankings = await pull(fetchPage, "TeamRankings opponent rebounds", TEAMRANKINGS_OPP_REBOUNDS_URL, htmlHeaders);
  if (!teamrankings.ok) return teamrankings;
  const teamrankingsSeason = publishedSeason("TeamRankings opponent rebounds", teamrankings.html);
  if (teamrankingsSeason) return teamrankingsSeason;

  const dimers = await fetchDimersSlate(date, sportsline.html, espn.games, fetchPage);

  const fetched: PublicFetch = {
    advanced: page(ADVANCED_URL, usage.html),
    perGame: page(PER_GAME_URL, perGame.html),
    pace: page(LEAGUE_URL, pace.html),
    last15,
    actuals: page(dailyLeadersUrl(date), boxScores.html),
    sportsline: page(SPORTSLINE_URL, sportsline.html),
    fantasypros: page(FANTASYPROS_DVP_URL, fantasypros.html),
    teamrankings: page(TEAMRANKINGS_OPP_REBOUNDS_URL, teamrankings.html),
    dimers,
    retrievedAt: savedAt,
  };
  return { ok: true, savedAt, espn: espn.games, fetched };
}

export function commitProjections(
  db: Database,
  date: string,
  collected: ProjectionCollected,
): { db?: Database; message: string; messages: ModelMessage[] } {
  if (!collected.ok) {
    return {
      message: `${collected.source} failed. Today's slate was not saved.`,
      messages: [{
        level: "error",
        playerId: null,
        message: `${collected.source} failed: ${collected.detail} No later source was called.`,
      }],
    };
  }
  const applied = applyPublicPages(db, date, collected.fetched);
  const sourceErrors = applied.messages.filter((item) => item.level === "error");
  if (sourceErrors.length) {
    const first = sourceErrors[0];
    return {
      message: `${first.message} Today's slate was not saved.`,
      messages: sourceErrors,
    };
  }
  const espnApplied = applyEspnOdds(applied.db, date, collected.espn, collected.savedAt);
  const ran = applyModelRun(espnApplied.db, date, collected.savedAt);
  const messages = [...applied.messages, ...espnApplied.messages, ...ran.messages];
  const graded = messages.find((item) => item.message.startsWith("Basketball Reference leaders graded"));
  const saved = messages.find((item) => item.message.startsWith("Saved "));
  const dimersNote = messages.find((item) => item.message.startsWith("Dimers did not load"));
  const lead = saved?.message ?? `Saved the ${date} slate.`;
  const parts = [lead, graded?.message, dimersNote?.message].filter((item): item is string => Boolean(item));
  return {
    db: ran.db,
    message: parts.join(" "),
    messages,
  };
}

export async function collectLines(date: string, fetchImpl?: PageFetch): Promise<ProbeResult> {
  const fetchPage: PageFetch = fetchImpl ?? (async (url, init) => {
    const response = await fetch(url, { headers: init.headers, signal: AbortSignal.timeout(20000) });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  return fetchBettingProsDay(date, fetchPage);
}

export function commitLines(
  db: Database,
  date: string,
  odds: ProbeResult,
  savedAt: string,
): { db?: Database; message: string; messages: ModelMessage[] } {
  if (odds.state !== "parsed") {
    return {
      message: `BettingPros failed. ${odds.message} Today's lines were not changed.`,
      messages: [{ level: "error", playerId: null, message: odds.message }],
    };
  }
  const applied = applyBettingProsProbe(db, date, odds, savedAt);
  const ran = applyModelRun(applied.db, date, savedAt);
  const messages = [...applied.messages, ...ran.messages];
  const saved = messages.find((item) => item.message.startsWith("Saved "));
  return {
    db: ran.db,
    message: saved?.message ?? `Loaded BettingPros lines for ${date}.`,
    messages,
  };
}
