import { canonicalTeam } from "./teams";

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
      dnp,
      opponent: canonicalTeam(row.opp_id || ""),
      location: (row.game_location || "").trim(),
    }];
  });
}

export function pageIsCurrentSeason(html: string): boolean {
  return html.includes("2026-27");
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

export type HashtagRow = { position: string; team: string; pointsAllowed: number; reboundsAllowed: number };

export function parseHashtag(html: string): HashtagRow[] {
  const start = html.indexOf('id="ContentPlaceHolder1_GridView1"');
  if (start < 0) return [];
  const end = html.indexOf("</table>", start);
  const table = html.slice(start, end);
  const rows: HashtagRow[] = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[\s\S]*?<\/td>/gi)].map((match) => {
      const labeled = [...match[0].matchAll(/<span id="[^"]*">([^<]*)<\/span>/g)]
        .map((span) => span[1].trim())
        .filter(Boolean);
      if (labeled.length) return labeled[0];
      return match[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
    });
    if (cells.length < 7) continue;
    const team = canonicalTeam(cells[1] ?? "");
    const pointsAllowed = Number(cells[2]);
    const reboundsAllowed = Number(cells[6]);
    if (!team || !Number.isFinite(pointsAllowed) || !Number.isFinite(reboundsAllowed)) continue;
    rows.push({ position: (cells[0] ?? "").toUpperCase(), team, pointsAllowed, reboundsAllowed });
  }
  return rows;
}
