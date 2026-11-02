export const BETTINGPROS_BASE = "https://api.bettingpros.com/v3";
export const POINTS_MARKET_ID = 156;
export const REBOUNDS_MARKET_ID = 157;
export const POINTS_REBOUNDS_MARKET_ID = 336;
export const CONSENSUS_BOOK_ID = 0;

export function bettingProsKey(): string | null {
  const key = process.env.BETTINGPROS_API_KEY?.trim();
  return key ? key : null;
}

export function bettingProsAvailability(): { state: "ready" | "setup_needed"; message: string } {
  if (!bettingProsKey()) {
    return {
      state: "setup_needed",
      message: "BettingPros is not configured. Set BETTINGPROS_API_KEY on the server. No odds call is made.",
    };
  }
  return {
    state: "ready",
    message: "BettingPros key is set. Check BettingPros makes one events call and one points offers page, then stops.",
  };
}

type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export type ParsedEvent = {
  id: string;
  home: string | null;
  away: string | null;
  spread: number | null;
  total: number | null;
};

export type ParsedOffer = {
  eventId: string | null;
  playerId: string | null;
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
};

export type ProbeResult = {
  state: "setup_needed" | "parsed" | "unparsed" | "error";
  message: string;
  calls: string[];
  events: ParsedEvent[];
  offers: ParsedOffer[];
  furtherPages: number | null;
};

function record(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function abbreviation(value: unknown): string | null {
  const row = record(value);
  if (!row) return text(value);
  return text(row.abbreviation) ?? text(row.abbr) ?? text(row.team) ?? (typeof row.team === "object" ? abbreviation(row.team) : null);
}

export function parseEventsPayload(body: string): { events: ParsedEvent[]; parsed: boolean } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { events: [], parsed: false };
  }
  const root = record(json);
  const list = Array.isArray(json) ? json : root && Array.isArray(root.events) ? root.events : null;
  if (!list) return { events: [], parsed: false };
  const events: ParsedEvent[] = [];
  for (const item of list) {
    const row = record(item);
    if (!row) continue;
    const id = text(row.id) ?? text(row.event_id);
    if (!id) continue;
    const participants = Array.isArray(row.participants) ? row.participants : [];
    const home = abbreviation(row.home) ?? abbreviation(row.home_team) ?? abbreviation(participants[0]);
    const away = abbreviation(row.visitor) ?? abbreviation(row.away) ?? abbreviation(row.away_team) ?? abbreviation(participants[1]);
    events.push({
      id,
      home,
      away,
      spread: num(row.spread) ?? num(row.home_spread),
      total: num(row.total) ?? num(row.game_total),
    });
  }
  return { events, parsed: true };
}

function bookLine(books: unknown): { line: number | null; odds: number | null } {
  if (!Array.isArray(books)) return { line: null, odds: null };
  for (const book of books) {
    const row = record(book);
    if (!row || num(row.id) !== CONSENSUS_BOOK_ID) continue;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    const first = record(lines[0]);
    if (!first) continue;
    return { line: num(first.line), odds: num(first.cost) ?? num(first.odds) };
  }
  return { line: null, odds: null };
}

export function parseOffersPage(body: string): { offers: ParsedOffer[]; parsed: boolean; furtherPages: number | null } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { offers: [], parsed: false, furtherPages: null };
  }
  const root = record(json);
  const list = root && Array.isArray(root.offers) ? root.offers : null;
  if (!list) return { offers: [], parsed: false, furtherPages: null };
  const pagination = record(root?.pagination) ?? record(root?._pagination);
  const page = num(pagination?.page) ?? 1;
  const total = num(pagination?.total_pages);
  const furtherPages = total == null ? null : Math.max(0, total - page);
  const offers: ParsedOffer[] = [];
  for (const item of list) {
    const row = record(item);
    if (!row) continue;
    const market = num(row.market_id);
    if (market != null && market !== POINTS_MARKET_ID) continue;
    const selections = Array.isArray(row.selections) ? row.selections : [];
    let line: number | null = null;
    let overOdds: number | null = null;
    let underOdds: number | null = null;
    for (const selection of selections) {
      const side = record(selection);
      if (!side) continue;
      const label = (text(side.selection) ?? text(side.label) ?? "").toLowerCase();
      const picked = bookLine(side.books);
      if (label.includes("under")) underOdds = picked.odds;
      else overOdds = picked.odds;
      if (picked.line != null) line = picked.line;
    }
    const participant = record(row.participant) ?? (Array.isArray(row.participants) ? record(row.participants[0]) : null);
    offers.push({
      eventId: text(row.event_id),
      playerId: text(row.player_id) ?? text(participant?.id),
      line,
      overOdds,
      underOdds,
    });
  }
  return { offers, parsed: true, furtherPages };
}

export async function probeBettingPros(date: string, fetchImpl?: FetchLike): Promise<ProbeResult> {
  const key = bettingProsKey();
  if (!key) {
    return {
      state: "setup_needed",
      message: bettingProsAvailability().message,
      calls: [],
      events: [],
      offers: [],
      furtherPages: null,
    };
  }
  const fetchPage = fetchImpl ?? (async (url: string, init: { headers: Record<string, string> }) => {
    const response = await fetch(url, { headers: init.headers, signal: AbortSignal.timeout(20000) });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  const headers = { "x-api-key": key, accept: "application/json" };
  const eventsUrl = `${BETTINGPROS_BASE}/events?sport=NBA&date=${encodeURIComponent(date)}`;
  const calls = [eventsUrl];
  let eventsResponse: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    eventsResponse = await fetchPage(eventsUrl, { headers });
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "BettingPros events call failed.",
      calls,
      events: [],
      offers: [],
      furtherPages: null,
    };
  }
  const eventsBody = await eventsResponse.text();
  if (!eventsResponse.ok) {
    return {
      state: "error",
      message: `BettingPros events returned HTTP ${eventsResponse.status}. Offers was not called.`,
      calls,
      events: [],
      offers: [],
      furtherPages: null,
    };
  }
  const events = parseEventsPayload(eventsBody);
  const first = events.events[0];
  if (!events.parsed || !first) {
    return {
      state: events.parsed ? "parsed" : "unparsed",
      message: events.parsed
        ? "Events parsed and listed no games. Offers was not called."
        : "Events response did not match the parser. Offers was not called. Full-slate paging stays off.",
      calls,
      events: events.events,
      offers: [],
      furtherPages: null,
    };
  }
  const offersUrl = `${BETTINGPROS_BASE}/offers?sport=NBA&event_id=${encodeURIComponent(first.id)}&market_id=${POINTS_MARKET_ID}&book_id=${CONSENSUS_BOOK_ID}`;
  calls.push(offersUrl);
  let offersResponse: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    offersResponse = await fetchPage(offersUrl, { headers });
  } catch (error) {
    return {
      state: "error",
      message: error instanceof Error ? error.message : "BettingPros offers call failed.",
      calls,
      events: events.events,
      offers: [],
      furtherPages: null,
    };
  }
  const offersBody = await offersResponse.text();
  if (!offersResponse.ok) {
    return {
      state: "error",
      message: `BettingPros offers returned HTTP ${offersResponse.status}. Stopped after one page.`,
      calls,
      events: events.events,
      offers: [],
      furtherPages: null,
    };
  }
  const offers = parseOffersPage(offersBody);
  const extra = offers.furtherPages && offers.furtherPages > 0 ? ` ${offers.furtherPages} more pages were left unread.` : "";
  return {
    state: offers.parsed ? "parsed" : "unparsed",
    message: offers.parsed
      ? `Checked one events call and one points offers page for event ${first.id}, then stopped.${extra}`
      : "Offers page did not match the parser. Stopped. Full-slate paging stays off.",
    calls,
    events: events.events,
    offers: offers.offers,
    furtherPages: offers.furtherPages,
  };
}
