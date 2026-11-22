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
  fromCache?: boolean;
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

export function parseEventsPayload(body: string): { events: ParsedEvent[]; parsed: boolean; page: number | null; totalPages: number | null } {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { events: [], parsed: false, page: null, totalPages: null };
  }
  const root = record(json);
  const list = Array.isArray(json) ? json : root && Array.isArray(root.events) ? root.events : null;
  if (!list) return { events: [], parsed: false, page: null, totalPages: null };
  const pagination = record(root?._pagination) ?? record(root?.pagination);
  const page = num(pagination?.page);
  const totalPages = num(pagination?.total_pages);
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
  return { events, parsed: true, page, totalPages };
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
  const pagination = record(root?._pagination) ?? record(root?.pagination);
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
const OFFER_GAP_MS = 1500;
const BURST_RETRIES = 3;
const DAILY_LIMIT_MESSAGE = "BettingPros daily limit exceeded (Limit Exceeded). It resets at midnight UTC.";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pageCount(total: number | null): number {
  if (total == null || !Number.isFinite(total) || total < 1) return 1;
  return Math.floor(total);
}

function eventsUrl(date: string, page?: number): string {
  const base = `${BETTINGPROS_BASE}/events?sport=NBA&date=${encodeURIComponent(date)}&limit=-1`;
  return page && page > 1 ? `${base}&page=${page}` : base;
}

function offersUrl(eventIds: string[], page?: number): string {
  const ids = eventIds.map((id) => encodeURIComponent(id)).join(":");
  const base = `${BETTINGPROS_BASE}/offers?sport=NBA&event_id=${ids}&market_id=${POINTS_MARKET_ID}:${REBOUNDS_MARKET_ID}&book_id=${CONSENSUS_BOOK_ID}&limit=-1`;
  return page && page > 1 ? `${base}&page=${page}` : base;
}

function appendEvents(current: ParsedEvent[], extra: ParsedEvent[]): ParsedEvent[] {
  const seen = new Set(current.map((event) => event.id));
  const next = current.slice();
  for (const event of extra) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    next.push(event);
  }
  return next;
}

type Attempt =
  | { ok: true; body: string }
  | { ok: false; burst: boolean; capped: boolean; message: string };

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
  const calls: string[] = [];
  let offerRequests = 0;

  const fetchOne = async (url: string, kind: "events" | "offers"): Promise<Attempt> => {
    if (calls.length >= MAX_BETTINGPROS_CALLS) {
      return { ok: false, burst: false, capped: true, message: `Stopped at ${MAX_BETTINGPROS_CALLS} calls.` };
    }
    if (kind === "offers" && offerRequests > 0) await wait(OFFER_GAP_MS);
    if (kind === "offers") offerRequests += 1;
    calls.push(url);
    let response: { ok: boolean; status: number; text: () => Promise<string> };
    try {
      response = await fetchPage(url, { headers });
    } catch (error) {
      const fallback = kind === "events" ? "BettingPros events call failed." : "BettingPros offers call failed.";
      return { ok: false, burst: false, capped: false, message: error instanceof Error ? error.message : fallback };
    }
    const body = await response.text();
    if (response.ok) return { ok: true, body };
    if (response.status === 429 && body.includes("Limit Exceeded")) {
      return { ok: false, burst: false, capped: false, message: DAILY_LIMIT_MESSAGE };
    }
    if (response.status === 429 && body.includes("Too Many Requests")) {
      return { ok: false, burst: true, capped: false, message: "BettingPros returned Too Many Requests." };
    }
    const firstEventsFailure = kind === "events" && calls.filter((item) => item.includes("/events")).length === 1;
    if (firstEventsFailure) {
      return { ok: false, burst: false, capped: false, message: `BettingPros events returned HTTP ${response.status}. Offers was not called.` };
    }
    return { ok: false, burst: false, capped: false, message: `Stopped after HTTP ${response.status}.` };
  };

  const fetchWithRetry = async (url: string, kind: "events" | "offers"): Promise<Attempt> => {
    let retries = 0;
    for (;;) {
      const attempt = await fetchOne(url, kind);
      if (attempt.ok || !attempt.burst || retries >= BURST_RETRIES) {
        if (!attempt.ok && attempt.burst) {
          return { ok: false, burst: true, capped: false, message: "BettingPros returned Too Many Requests. Stopped after retrying that page." };
        }
        return attempt;
      }
      retries += 1;
      if (kind === "events") await wait(OFFER_GAP_MS);
    }
  };

  const failed = (message: string, events: ParsedEvent[], offers: ParsedOffer[], furtherPages: number | null): ProbeResult => ({
    state: "error",
    message,
    calls,
    events,
    offers,
    furtherPages,
  });

  let events: ParsedEvent[] = [];
  let totalEventPages = 1;
  for (let page = 1; page <= totalEventPages; page += 1) {
    const attempt = await fetchWithRetry(eventsUrl(date, page), "events");
    if (!attempt.ok) return failed(attempt.message, events, [], null);
    const parsed = parseEventsPayload(attempt.body);
    if (!parsed.parsed) {
      return {
        state: "unparsed",
        message: "Events response did not match the parser. Offers was not called. Full-slate paging stays off.",
        calls,
        events,
        offers: [],
        furtherPages: null,
      };
    }
    if (page > 1 && parsed.page === 1) {
      return failed("Paging stopped because an events page still reported page 1.", events, [], null);
    }
    events = appendEvents(events, parsed.events);
    if (page === 1) totalEventPages = pageCount(parsed.totalPages);
  }
  if (!events.length) {
    return {
      state: "parsed",
      message: "Events parsed and listed no games. Offers was not called.",
      calls,
      events,
      offers: [],
      furtherPages: null,
    };
  }

  const eventIds = events.map((event) => event.id);
  const offers: ParsedOffer[] = [];
  let totalOfferPages = 1;
  for (let page = 1; page <= totalOfferPages; page += 1) {
    const attempt = await fetchWithRetry(offersUrl(eventIds, page), "offers");
    const remaining = Math.max(0, totalOfferPages - page + 1);
    if (!attempt.ok) return failed(attempt.message, events, offers, remaining);
    const parsed = parseOffersPage(attempt.body);
    if (!parsed.parsed) {
      return {
        state: page === 1 ? "unparsed" : "error",
        message: page === 1
          ? "Offers page did not match the parser. Stopped before any other odds calls."
          : "A later offers page did not match the parser, so paging stopped.",
        calls,
        events,
        offers,
        furtherPages: remaining,
      };
    }
    if (page > 1 && parsed.page === 1) {
      return failed("Paging stopped because an offers page still reported page 1.", events, offers, Math.max(0, totalOfferPages - page));
    }
    if (page === 1) totalOfferPages = pageCount(parsed.totalPages);
    offers.push(...parsed.offers);
  }
  return {
    state: "parsed",
    message: `Loaded ${events.length} events and ${offers.length} consensus lines for ${date}.`,
    calls,
    events,
    offers,
    furtherPages: 0,
  };
}

export const probeBettingPros = fetchBettingProsDay;
