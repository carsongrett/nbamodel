import { CURRENT_SEASON, POSITIONS, type Position } from "../engine";
import { canonicalTeam, teamFromLabel } from "./teams";

export type BrefPlayerRow = {
  playerId: string;
  name: string;
  team: string | null;
  combined: boolean;
  position: string | null;
  games: number | null;
  usgPct: number | null;
  trbPerGame: number | null;
  mpPerGame: number | null;
  points: number | null;
  rebounds: number | null;
  /** Minutes in that game. Empty on season pages and on rows that did not play. */
  minutes: number | null;
  dnp: boolean;
  opponent: string | null;
  location: string;
};

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function unwrapBref(html: string): string {
  return html.replace(/<!--([\s\S]*?)-->/g, (full, inner: string) => (inner.includes("data-stat") ? inner : full));
}

export function brefRecords(html: string): Record<string, string>[] {
  const doc = unwrapBref(html);
  const rows: Record<string, string>[] = [];
  for (const tr of doc.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    if (!tr.includes("data-stat=") || !tr.includes("<td")) continue;
    const record: Record<string, string> = {};
    for (const cell of tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []) {
      const stat = /data-stat="([^"]+)"/.exec(cell)?.[1];
      if (!stat) continue;
      const append = /data-append-csv="([^"]*)"/.exec(cell)?.[1];
      record[stat] = decode(cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (append) record[`${stat}Id`] = append;
    }
    if (record.player || record.name_display || record.playerId || record.name_displayId) rows.push(record);
  }
  return rows;
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const text = value.replace(/%/g, "").trim();
  if (text === "" || text === "Did Not Play" || text === "Inactive" || text === "Did Not Dress") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Daily leaders write minutes as 32:15. A bare number is already minutes. */
function minutesPlayed(value: string | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  if (text === "" || /did not play|inactive|did not dress/i.test(text)) return null;
  const clock = /^(\d+):(\d{2})$/.exec(text);
  if (clock) {
    const minutes = Number(clock[1]) + Number(clock[2]) / 60;
    return Number.isFinite(minutes) ? minutes : null;
  }
  return num(text);
}

function int(value: string | undefined): number | null {
  const parsed = num(value);
  return parsed == null ? null : Math.round(parsed);
}

function playerIdOf(row: Record<string, string>): string | null {
  const id = (row.playerId || row.name_displayId || "").trim();
  return id || null;
}

function nameOf(row: Record<string, string>): string {
  return (row.player || row.name_display || "").trim();
}

export function parseBrefPlayers(html: string): BrefPlayerRow[] {
  return brefRecords(html).flatMap((row) => {
    const playerId = playerIdOf(row);
    const name = nameOf(row);
    if (!playerId || !name || name === "Player") return [];
    const teamRaw = (row.team_name_abbr || row.team_id || "").trim();
    const combined = teamRaw.toUpperCase() === "TOT" || teamRaw === "2TM" || teamRaw === "3TM";
    const dnpText = `${row.pts ?? ""} ${row.reason ?? ""}`;
    const dnp = /did not play|inactive|did not dress/i.test(dnpText);
    return [{
      playerId,
      name,
      team: canonicalTeam(teamRaw),
      combined,
      position: (row.pos || "").trim().toUpperCase() || null,
      games: int(row.games ?? row.g),
      usgPct: num(row.usg_pct),
      trbPerGame: num(row.trb_per_g),
      mpPerGame: num(row.mp_per_g),
      points: dnp ? null : num(row.pts),
      rebounds: dnp ? null : num(row.trb),
      minutes: dnp ? null : minutesPlayed(row.mp),
      dnp,
      opponent: canonicalTeam(row.opp_id || ""),
      location: (row.game_location || "").trim(),
    }];
  });
}

export function parseTeamPace(html: string): { team: string; pace: number }[] {
  const doc = unwrapBref(html);
  const table = /<table\b[^>]*id="advanced-team"[\s\S]*?<\/table>/i.exec(doc)?.[0];
  if (!table) return [];
  const rows: { team: string; pace: number }[] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const abbr = /\/teams\/([A-Za-z]{2,3})\//.exec(tr)?.[1];
    const paceText = /data-stat="pace"[^>]*>([^<]*)/.exec(tr)?.[1];
    const pace = num(paceText);
    const team = abbr ? canonicalTeam(abbr) : null;
    if (!team || pace == null) continue;
    rows.push({ team, pace });
  }
  return rows;
}

export function pageIsCurrentSeason(html: string): boolean {
  return html.includes("2026-27");
}

/** 2026-27, the en-dash form, or 2026-2027. TeamRankings and FantasyPros use the long form. */
export function pageMentionsCurrentSeason(html: string): boolean {
  const start = CURRENT_SEASON.slice(0, 4);
  const end = CURRENT_SEASON.slice(5);
  return html.includes(CURRENT_SEASON) || html.includes(`${start}–${end}`) || html.includes(`${start}-20${end}`);
}

export type SportsLineRow = {
  player: string;
  position: string;
  team: string | null;
  away: string | null;
  home: string | null;
  points: number | null;
  minutes: number | null;
  rebounds: number | null;
};

export function parseSportsLine(html: string): SportsLineRow[] {
  const header = html.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? "";
  const columns = [...header.matchAll(/<th[^>]*\bid="([^"]+)"/gi)].map((match) => match[1].toUpperCase());
  const index = (name: string) => columns.indexOf(name);
  const pts = index("PTS");
  const min = index("MIN");
  const trb = index("TRB");
  const player = index("PLAYER");
  const pos = index("POS");
  const team = index("TEAM");
  const game = index("GAME");
  if (pts < 0 || min < 0 || trb < 0 || player < 0) return [];
  const body = html.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] ?? "";
  const rows: SportsLineRow[] = [];
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      decode(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
    );
    const gameText = game >= 0 ? cells[game] ?? "" : "";
    const sides = gameText.split("@");
    const away = sides.length === 2 ? canonicalTeam(sides[0]) : null;
    const home = sides.length === 2 ? canonicalTeam(sides[1]) : null;
    const value = (at: number) => (at >= 0 && cells[at] != null && cells[at] !== "" ? Number(cells[at]) : null);
    const points = value(pts);
    const minutes = value(min);
    const rebounds = value(trb);
    rows.push({
      player: cells[player] ?? "",
      position: (cells[pos] ?? "").toUpperCase(),
      team: team >= 0 ? canonicalTeam(cells[team] ?? "") : null,
      away,
      home,
      points: points != null && Number.isFinite(points) ? points : null,
      minutes: minutes != null && Number.isFinite(minutes) ? minutes : null,
      rebounds: rebounds != null && Number.isFinite(rebounds) ? rebounds : null,
    });
  }
  return rows.filter((row) => row.player);
}

export type TeamRankingsRebound = { team: string; season: number; last3: number };

/** Season and Last 3 are columns on the same table. Last 3 is not a query. */
export function parseTeamRankingsOppRebounds(html: string): TeamRankingsRebound[] {
  const table = html.match(/<table\b[^>]*class="[^"]*\btr-table\b[^"]*"[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const headerRow = table.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? "";
  const headers = cellsOf(headerRow.match(/<tr[\s\S]*?<\/tr>/i)?.[0] ?? "").map((cell) => cell.toLowerCase());
  const seasonYear = CURRENT_SEASON.slice(0, 4);
  const seasonAt = headers.findIndex((header) => header === seasonYear);
  const last3At = headers.findIndex((header) => /^last\s*3$/.test(header));
  if (seasonAt < 0 || last3At < 0) return [];
  const body = table.match(/<tbody[\s\S]*?<\/tbody>/i)?.[0] ?? table;
  const rows: TeamRankingsRebound[] = [];
  for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const values = cellsOf(tr);
    const team = teamFromLabel(values[1] ?? "");
    const season = statNumber(values[seasonAt] ?? "");
    const last3 = statNumber(values[last3At] ?? "");
    if (!team || season == null || last3 == null) continue;
    rows.push({ team, season, last3 });
  }
  return rows;
}

export type FanduelWindow = "l15" | "l30";
export type FanduelDefenseRow = {
  team: string;
  position: Position;
  points: number | null;
  rebounds: number | null;
};

/**
 * Last 15 and last 30 are rows in the same HTML, class GC-15 and GC-30.
 * They are not selected with a query param. Points and rebounds are those columns.
 */
export function parseFanduelDefense(html: string): { l15: FanduelDefenseRow[]; l30: FanduelDefenseRow[] } {
  const empty = { l15: [] as FanduelDefenseRow[], l30: [] as FanduelDefenseRow[] };
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  const table = tables.find((item) => /GC-15|GC-30/.test(item)) ?? null;
  if (!table) return empty;
  const headerRow = table.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? "";
  const headers = cellsOf(headerRow.match(/<tr[\s\S]*?<\/tr>/i)?.[0] ?? "").map((cell) => cell.toUpperCase());
  const pointsAt = headers.indexOf("PTS");
  const reboundsAt = headers.indexOf("REB");
  if (pointsAt < 0 || reboundsAt < 0) return empty;
  const l15: FanduelDefenseRow[] = [];
  const l30: FanduelDefenseRow[] = [];
  for (const tr of table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const className = /class="([^"]*)"/i.exec(tr)?.[1] ?? "";
    const tokens = new Set(className.split(/\s+/).filter(Boolean));
    const window = tokens.has("GC-15") ? "l15" : tokens.has("GC-30") ? "l30" : null;
    const position = POSITIONS.find((item) => tokens.has(item));
    if (!window || !position) continue;
    const logo = /nba-([a-z0-9]+)/i.exec(tr)?.[1] ?? "";
    const values = cellsOf(tr);
    const team = teamFromLabel(logo) ?? teamFromLabel(values[0] ?? "");
    if (!team) continue;
    const row: FanduelDefenseRow = {
      team,
      position,
      points: statNumber(values[pointsAt] ?? ""),
      rebounds: statNumber(values[reboundsAt] ?? ""),
    };
    if (window === "l15") l15.push(row);
    else l30.push(row);
  }
  return { l15, l30 };
}

function cellsOf(row: string): string[] {
  return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    decode(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
  );
}

function statNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "--" || cleaned === "—") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
