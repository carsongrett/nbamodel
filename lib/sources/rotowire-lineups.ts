import { canonicalTeam } from "./teams";

/** Public lineup page. Home-team minutes are paywalled and this check does not request them. */
export const ROTOWIRE_LINEUPS_URL = "https://www.rotowire.com/basketball/nba-lineups.php";

export type LineupInjury = "Questionable" | "Probable" | "Doubtful" | "Out" | "Out for season";

export type LineupPlayer = {
  name: string;
  role: "starter" | "bench";
  injury: LineupInjury | null;
};

export type LineupTeam = {
  teamId: string;
  confirmed: boolean;
  players: LineupPlayer[];
};

const INJURY_TAGS: Record<string, LineupInjury> = {
  ques: "Questionable",
  questionable: "Questionable",
  prob: "Probable",
  probable: "Probable",
  dou: "Doubtful",
  doubt: "Doubtful",
  doubtful: "Doubtful",
  out: "Out",
  ofs: "Out for season",
  "out for season": "Out for season",
};

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/;

function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(parseInt(value, 16)));
}

/**
 * Published-name key for this page. Accents and punctuation drop out.
 * Hyphens become spaces. P.J. and P. J. share a key. A trailing Jr or III stays on the exact key.
 */
export function lineupNameKey(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‐‒–—−-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter(Boolean);
  const merged: string[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (token.length === 1 && previous && previous.length === 1) merged[merged.length - 1] = previous + token;
    else merged.push(token);
  }
  return merged.join(" ");
}

function bareName(key: string): string {
  const tokens = key.split(" ").filter(Boolean);
  if (tokens.length >= 2 && SUFFIX.test(tokens[tokens.length - 1] ?? "")) tokens.pop();
  return tokens.join(" ");
}

function injuryWord(raw: string): LineupInjury | null {
  const key = decode(raw).replace(/\s+/g, " ").trim().toLowerCase();
  if (!key) return null;
  return INJURY_TAGS[key] ?? null;
}

function playersIn(body: string, role: LineupPlayer["role"]): LineupPlayer[] {
  const players: LineupPlayer[] = [];
  for (const item of body.match(/<li\b[^>]*class="[^"]*\blineup__player\b[^"]*"[\s\S]*?<\/li>/gi) ?? []) {
    const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(item);
    if (!anchor) continue;
    const title = /title="([^"]*)"/i.exec(anchor[1])?.[1];
    const name = decode((title || anchor[2]).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!name) continue;
    const tag = /class="lineup__inj"[^>]*>([^<]*)</i.exec(item)?.[1] ?? "";
    players.push({ name, role, injury: injuryWord(tag) });
  }
  return players;
}

function teamList(block: string, side: "is-visit" | "is-home", abbr: string | undefined): LineupTeam | null {
  if (!abbr) return null;
  const teamId = canonicalTeam(abbr);
  if (!teamId) return null;
  const body = new RegExp(`<ul class="lineup__list ${side}">([\\s\\S]*?)<\\/ul>`, "i").exec(block)?.[1];
  if (!body) return null;
  const cut = body.search(/MAY NOT PLAY/i);
  const starters = playersIn(cut === -1 ? body : body.slice(0, cut), "starter");
  const bench = playersIn(cut === -1 ? "" : body.slice(cut), "bench");
  const players = new Map<string, LineupPlayer>();
  for (const player of [...starters, ...bench]) {
    const key = lineupNameKey(player.name);
    if (!key) continue;
    const existing = players.get(key);
    if (!existing) {
      players.set(key, player);
      continue;
    }
    const starter = existing.role === "starter" ? existing : player.role === "starter" ? player : existing;
    const other = starter === existing ? player : existing;
    players.set(key, { name: starter.name, role: starter.role, injury: starter.injury ?? other.injury });
  }
  if (players.size === 0) return null;
  return {
    teamId,
    confirmed: /class="lineup__status[^"]*\bis-confirmed\b/i.test(body),
    players: [...players.values()],
  };
}

/**
 * Each `lineup is-nba` game has two `lineup__abbr` teams and two `lineup__list` columns.
 * Players above "MAY NOT PLAY" are that team's five. The status line is Confirmed or Expected.
 * The anchor title is the full name. `lineup__inj` is the tag, when present.
 */
export function parseRotowireLineups(html: string): LineupTeam[] {
  const openings = [...html.matchAll(/<div class="(lineup is-nba[^"]*)"[^>]*>/g)];
  const teams: LineupTeam[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < openings.length; index++) {
    const opening = openings[index];
    if (/\bis-tools\b|\bis-ad\b/.test(opening[1] ?? "")) continue;
    const start = opening.index ?? 0;
    const end = index + 1 < openings.length ? (openings[index + 1]?.index ?? html.length) : html.length;
    const block = html.slice(start, end);
    const abbrs = [...block.matchAll(/class="lineup__abbr">\s*([^<]+?)\s*</g)].map((match) => match[1].trim());
    for (const team of [teamList(block, "is-visit", abbrs[0]), teamList(block, "is-home", abbrs[1])]) {
      if (!team || seen.has(team.teamId)) continue;
      seen.add(team.teamId);
      teams.push(team);
    }
  }
  return teams;
}

function matchedPlayer(players: LineupPlayer[], playerName: string): LineupPlayer | null {
  const key = lineupNameKey(playerName);
  if (!key) return null;
  const exact = players.filter((player) => lineupNameKey(player.name) === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const bare = bareName(key);
  const loose = players.filter((player) => bareName(lineupNameKey(player.name)) === bare);
  return loose.length === 1 ? loose[0] : null;
}

export function noteForPlayer(teams: LineupTeam[], teamId: string, playerName: string): string | null {
  const canonical = canonicalTeam(teamId) ?? teamId.trim().toUpperCase();
  const team = teams.find((item) => item.teamId === canonical);
  if (!team) return null;
  const player = matchedPlayer(team.players, playerName);
  if (!player) return null;
  const base = player.role === "starter" ? (team.confirmed ? "Starting · confirmed" : "Starting") : "Bench";
  return player.injury ? `${base} · ${player.injury}` : base;
}

export type LineupFetch = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal; cache?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function fetchRotowireLineups(fetchImpl?: LineupFetch): Promise<
  { ok: true; teams: LineupTeam[]; message: string } | { ok: false; error: string }
> {
  const fetchPage: LineupFetch = fetchImpl ?? (async (input, init) => {
    const response = await fetch(input, {
      headers: init?.headers,
      signal: init?.signal,
      cache: "no-store",
    });
    return { ok: response.ok, status: response.status, text: () => response.text() };
  });
  let response: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    response = await fetchPage(ROTOWIRE_LINEUPS_URL, {
      headers: { accept: "text/html", "user-agent": "nbamodel personal desk" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Rotowire lineups could not be loaded." };
  }
  if (!response.ok) return { ok: false, error: `Rotowire lineups returned HTTP ${response.status}.` };
  const teams = parseRotowireLineups(await response.text());
  if (teams.length === 0) return { ok: false, error: "Rotowire lineups page did not include a lineup." };
  const count = teams.length === 1 ? "1 team" : `${teams.length} teams`;
  return { ok: true, teams, message: `Injury and lineup notes loaded for ${count}.` };
}
