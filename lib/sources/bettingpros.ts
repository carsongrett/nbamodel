import { bettingProsKeyIssue, projectDir, readProjectEnv } from "./env-file";
import { canonicalTeam } from "./teams";

export const BETTINGPROS_BASE = "https://api.bettingpros.com/v3";
export const POINTS_MARKET_ID = 156;
export const REBOUNDS_MARKET_ID = 157;
export const POINTS_REBOUNDS_MARKET_ID = 336;
export const SPREAD_MARKET_ID = 129;
export const TOTAL_MARKET_ID = 128;
export const CONSENSUS_BOOK_ID = 0;

function diskKeyAllowed(): boolean {
  return !process.env.NODE_TEST_CONTEXT && process.env.npm_lifecycle_event !== "test";
}

export function bettingProsKey(): string | null {
  const fromProcess = process.env.BETTINGPROS_API_KEY?.trim();
  if (fromProcess) return fromProcess;
  if (!diskKeyAllowed()) return null;
  return readProjectEnv(projectDir()).key;
}

export function bettingProsAvailability(): { state: "ready" | "setup_needed"; message: string } {
  const fromProcess = process.env.BETTINGPROS_API_KEY?.trim();
  if (fromProcess) {
    return {
      state: "ready",
      message: "BettingPros key is set. Lines loads today's consensus points and rebounds. Points plus rebounds is the two projections added together, and that line is not requested. A typed number is replaced until results are stored. The spread and total come from Projections, which reads ESPN. The desk stops at 40 calls.",
    };
  }
  if (!diskKeyAllowed()) {
    return {
      state: "setup_needed",
      message: "BettingPros is not configured. Set BETTINGPROS_API_KEY on the server. No odds call is made.",
    };
  }
  const report = readProjectEnv(projectDir());
  if (report.key) {
    return {
      state: "ready",
      message: `BettingPros key was read from ${report.source} in ${report.directory}. Lines loads today's points and rebounds. A server restart is not required.`,
    };
  }
  return { state: "setup_needed", message: `${bettingProsKeyIssue(report)} No odds call is made.` };
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
  name: string | null;
  marketId: number | null;
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

const LIVE_MARKETS = new Set([POINTS_MARKET_ID, REBOUNDS_MARKET_ID]);

export function parseOffersPage(body: string): { offers: ParsedOffer[]; parsed: boolean; page: number | null; totalPages: number | null; furtherPages: number | null } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { offers: [], parsed: false, page: null, totalPages: null, furtherPages: null };
  }
  const root = record(json);
  const list = root && Array.isArray(root.offers) ? root.offers : null;
  if (!list) return { offers: [], parsed: false, page: null, totalPages: null, furtherPages: null };
  const pagination = record(root?.pagination) ?? record(root?._pagination);
  const page = num(pagination?.page);
  const total = num(pagination?.total_pages);
  const furtherPages = total == null ? null : Math.max(0, total - (page ?? 1));
  const offers: ParsedOffer[] = [];
  for (const item of list) {
    const row = record(item);
    if (!row) continue;
    const market = num(row.market_id);
    if (market != null && !LIVE_MARKETS.has(market)) continue;
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
      name: text(row.player_name) ?? text(row.name) ?? text(participant?.name) ?? text(participant?.player_name),
      marketId: market,
      line,
      overOdds,
      underOdds,
    });
  }
  return { offers, parsed: true, page, totalPages: total, furtherPages };
}

/** Home spread is the home team's signed line. Total is the over. */
export function parseGameMarket(body: string, marketId: number, home: string | null): number | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const root = record(json);
  const list = root && Array.isArray(root.offers) ? root.offers : null;
  if (!list) return null;
  const homeId = home ? canonicalTeam(home) : null;
  for (const item of list) {
    const row = record(item);
    if (!row) continue;
    const market = num(row.market_id);
    if (market != null && market !== marketId) continue;
    const selections = Array.isArray(row.selections) ? row.selections : [];
    for (const selection of selections) {
      const side = record(selection);
      if (!side) continue;
      const picked = bookLine(side.books);
      if (picked.line == null) continue;
      if (marketId === TOTAL_MARKET_ID) {
        const label = (text(side.selection) ?? text(side.label) ?? "").toLowerCase();
        if (label.includes("over")) return picked.line;
      }
      if (marketId === SPREAD_MARKET_ID && homeId) {
        const who = canonicalTeam(text(side.participant) ?? text(side.short_label) ?? "");
        if (who === homeId) return picked.line;
      }
    }
  }
  return null;
}

const MAX_BETTINGPROS_CALLS = 40;
const OFFER_GAP_MS = 500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function offersUrl(eventId: string, marketId: number, page?: number): string {
  const base = `${BETTINGPROS_BASE}/offers?sport=NBA&event_id=${encodeURIComponent(eventId)}&market_id=${marketId}&book_id=${CONSENSUS_BOOK_ID}`;
  return page && page > 1 ? `${base}&page=${page}` : base;
}

function stampOffers(offers: ParsedOffer[], eventId: string, marketId: number): ParsedOffer[] {
  return offers.map((offer) => ({
    ...offer,
    eventId: offer.eventId ?? eventId,
    marketId: offer.marketId ?? marketId,
  }));
}

export async function fetchBettingProsDay(date: string, fetchImpl?: FetchLike): Promise<ProbeResult> {
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
  let offersRequested = 0;
  const requestOffer = async (url: string) => {
    if (offersRequested > 0) await wait(OFFER_GAP_MS);
    offersRequested += 1;
    calls.push(url);
    return fetchPage(url, { headers });
  };
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
  const proofUrl = offersUrl(first.id, POINTS_MARKET_ID);
  let proofResponse: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    proofResponse = await requestOffer(proofUrl);
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
  const proofBody = await proofResponse.text();
  if (!proofResponse.ok) {
    return {
      state: "error",
      message: `BettingPros offers returned HTTP ${proofResponse.status}. Stopped before any other odds calls.`,
      calls,
      events: events.events,
      offers: [],
      furtherPages: null,
    };
  }
  const proof = parseOffersPage(proofBody);
  if (!proof.parsed) {
    return {
      state: "unparsed",
      message: "Offers page did not match the parser. Stopped before any other odds calls.",
      calls,
      events: events.events,
      offers: [],
      furtherPages: null,
    };
  }

  const offers = stampOffers(proof.offers, first.id, POINTS_MARKET_ID);
  let unread = 0;
  let stopped = "";
  let halt = false;

  const pull = async (eventId: string, marketId: number, page: number) => {
    const url = offersUrl(eventId, marketId, page);
    try {
      const response = await requestOffer(url);
      const body = await response.text();
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { ok: false, status: 0, body: error instanceof Error ? error.message : "BettingPros offers call failed." };
    }
  };

  for (const event of events.events) {
    if (halt) break;
    for (const marketId of [POINTS_MARKET_ID, REBOUNDS_MARKET_ID]) {
      const known = event.id === first.id && marketId === POINTS_MARKET_ID ? proof : null;
      let totalPages = known ? (known.totalPages ?? 1) : null;
      for (let page = known ? 2 : 1; totalPages == null || page <= totalPages; page += 1) {
        if (calls.length >= MAX_BETTINGPROS_CALLS) {
          unread += totalPages == null ? 1 : Math.max(0, totalPages - page + 1);
          stopped = `Stopped at ${MAX_BETTINGPROS_CALLS} calls.`;
          halt = true;
          break;
        }
        const response = await pull(event.id, marketId, page);
        if (!response.ok) {
          stopped = response.status ? `Stopped after HTTP ${response.status}.` : `Stopped: ${response.body}`;
          halt = true;
          break;
        }
        const parsed = parseOffersPage(response.body);
        if (!parsed.parsed) {
          stopped = "A later offers page did not match the parser, so paging stopped.";
          halt = true;
          break;
        }
        if (page > 1 && parsed.page === 1) {
          stopped = "Paging stopped because an offers page still reported page 1.";
          halt = true;
          break;
        }
        if (totalPages == null) totalPages = parsed.totalPages ?? 1;
        offers.push(...stampOffers(parsed.offers, event.id, marketId));
        if (page >= totalPages) break;
      }
      if (halt) break;
    }
    if (halt) break;
  }

  if (stopped) {
    return {
      state: "error",
      message: stopped,
      calls,
      events: events.events,
      offers,
      furtherPages: unread,
    };
  }
  return {
    state: "parsed",
    message: `Loaded ${events.events.length} events and ${offers.length} consensus lines for ${date}.`,
    calls,
    events: events.events,
    offers,
    furtherPages: unread,
  };
}

export const probeBettingPros = fetchBettingProsDay;
