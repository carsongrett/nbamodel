import { dailyLeadersUrl, shiftDate } from "./teams";
import type { FetchedPage, PublicFetch } from "./apply";

const ADVANCED_URL = "https://www.basketball-reference.com/leagues/NBA_2027_advanced.html";
const PER_GAME_URL = "https://www.basketball-reference.com/leagues/NBA_2027_per_game.html";
const LEAGUE_URL = "https://www.basketball-reference.com/leagues/NBA_2027.html";
const SPORTSLINE_URL = "https://www.sportsline.com/nba/expert-projections/simulation/";
const HASHTAG_URL = "https://hashtagbasketball.com/nba-defense-vs-position";

async function getPage(url: string): Promise<FetchedPage> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html",
        "user-agent": "nbamodel personal desk",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { url, ok: false, error: `HTTP ${response.status}` };
    return { url, ok: true, html: await response.text() };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : "Fetch failed." };
  }
}

export async function fetchPublicPages(slateDate: string, retrievedAt = new Date().toISOString()): Promise<PublicFetch> {
  const last15: PublicFetch["last15"] = [];
  for (let ago = 1; ago <= 15; ago++) {
    const date = shiftDate(slateDate, -ago);
    last15.push({ date, page: await getPage(dailyLeadersUrl(date)) });
  }
  const [advanced, perGame, pace, actuals, sportsline, hashtag] = await Promise.all([
    getPage(ADVANCED_URL),
    getPage(PER_GAME_URL),
    getPage(LEAGUE_URL),
    getPage(dailyLeadersUrl(slateDate)),
    getPage(SPORTSLINE_URL),
    getPage(HASHTAG_URL),
  ]);
  return { advanced, perGame, pace, last15, actuals, sportsline, hashtag, retrievedAt };
}
