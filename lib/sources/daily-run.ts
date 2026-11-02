import { applyModelRun, type Database, type ModelMessage } from "../engine";
import { applyPublicPages, type FetchedPage, type PublicFetch } from "./apply";
import { applyBettingProsProbe } from "./apply-bettingpros";
import { fetchBettingProsDay, type ProbeResult } from "./bettingpros";
import { pageIsCurrentSeason } from "./parsers";
import { dailyLeadersUrl, shiftDate } from "./teams";

const ADVANCED_URL = "https://www.basketball-reference.com/leagues/NBA_2027_advanced.html";
const PER_GAME_URL = "https://www.basketball-reference.com/leagues/NBA_2027_per_game.html";
const LEAGUE_URL = "https://www.basketball-reference.com/leagues/NBA_2027.html";
const SPORTSLINE_URL = "https://www.sportsline.com/nba/expert-projections/simulation/";
const HASHTAG_URL = "https://hashtagbasketball.com/nba-defense-vs-position";

export type PageResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type PageFetch = (url: string, init: { headers: Record<string, string> }) => Promise<PageResponse>;

export type DailyFailure = { ok: false; source: string; detail: string };
export type DailySuccess = { ok: true; fetched: PublicFetch; odds: ProbeResult; savedAt: string };
export type DailyCollected = DailySuccess | DailyFailure;

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

function page(url: string, html: string): FetchedPage {
  return { url, ok: true, html };
}

export async function collectDailySources(date: string, savedAt: string, fetchImpl?: PageFetch): Promise<DailyCollected> {
  const fetchPage: PageFetch = fetchImpl ?? (async (url, init) => {
    const response = await fetch(url, { headers: init.headers, signal: AbortSignal.timeout(20000) });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  const odds = await fetchBettingProsDay(date, fetchPage);
  if (odds.state !== "parsed") return failed("BettingPros", odds.message);

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

  const hashtag = await pull(fetchPage, "Hashtag defense vs position", HASHTAG_URL, htmlHeaders);
  if (!hashtag.ok) return hashtag;
  const hashtagSeason = seasonPage("Hashtag defense vs position", hashtag.html);
  if (hashtagSeason) return hashtagSeason;

  return {
    ok: true,
    savedAt,
    odds,
    fetched: {
      advanced: page(ADVANCED_URL, usage.html),
      perGame: page(PER_GAME_URL, perGame.html),
      pace: page(LEAGUE_URL, pace.html),
      last15,
      actuals: page(dailyLeadersUrl(date), boxScores.html),
      sportsline: page(SPORTSLINE_URL, sportsline.html),
      hashtag: page(HASHTAG_URL, hashtag.html),
      retrievedAt: savedAt,
    },
  };
}

export function commitDaily(
  db: Database,
  date: string,
  collected: DailyCollected,
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
  const oddsApplied = applyBettingProsProbe(applied.db, date, collected.odds, collected.savedAt);
  const ran = applyModelRun(oddsApplied.db, date, collected.savedAt);
  const messages = [...applied.messages, ...oddsApplied.messages, ...ran.messages];
  const graded = messages.find((item) => item.message.startsWith("Basketball Reference leaders graded"));
  const saved = messages.find((item) => item.message.startsWith("Saved "));
  const lead = saved?.message ?? `Saved the ${date} slate.`;
  return {
    db: ran.db,
    message: graded ? `${lead} ${graded.message}` : lead,
    messages,
  };
}
