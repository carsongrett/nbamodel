const ALIASES: Record<string, string> = {
  BRK: "BKN",
  BKN: "BKN",
  CHO: "CHA",
  CHA: "CHA",
  GSW: "GSW",
  GS: "GSW",
  NOP: "NOP",
  NO: "NOP",
  NOR: "NOP",
  NYK: "NYK",
  NY: "NYK",
  PHO: "PHX",
  PHX: "PHX",
  SAS: "SAS",
  SA: "SAS",
  UTA: "UTA",
  UTH: "UTA",
  WAS: "WAS",
  WSH: "WAS",
};

const NOT_A_TEAM = new Set(["TOT", "2TM", "3TM"]);

/** Exact abbreviation crosswalk. Not a name match. */
export function canonicalTeam(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(text) || NOT_A_TEAM.has(text)) return null;
  return ALIASES[text] ?? text;
}

/** Published city and team labels. Exact after spacing is collapsed. */
const TEAM_NAMES: Record<string, string> = {
  atlanta: "ATL",
  "atlanta hawks": "ATL",
  boston: "BOS",
  "boston celtics": "BOS",
  brooklyn: "BKN",
  "brooklyn nets": "BKN",
  charlotte: "CHA",
  "charlotte hornets": "CHA",
  chicago: "CHI",
  "chicago bulls": "CHI",
  cleveland: "CLE",
  "cleveland cavaliers": "CLE",
  dallas: "DAL",
  "dallas mavericks": "DAL",
  denver: "DEN",
  "denver nuggets": "DEN",
  detroit: "DET",
  "detroit pistons": "DET",
  "golden state": "GSW",
  "golden state warriors": "GSW",
  houston: "HOU",
  "houston rockets": "HOU",
  indiana: "IND",
  "indiana pacers": "IND",
  clippers: "LAC",
  "la clippers": "LAC",
  "los angeles clippers": "LAC",
  lakers: "LAL",
  "la lakers": "LAL",
  "los angeles lakers": "LAL",
  memphis: "MEM",
  "memphis grizzlies": "MEM",
  miami: "MIA",
  "miami heat": "MIA",
  milwaukee: "MIL",
  "milwaukee bucks": "MIL",
  minnesota: "MIN",
  "minnesota timberwolves": "MIN",
  "new orleans": "NOP",
  "new orleans pelicans": "NOP",
  "new york": "NYK",
  "new york knicks": "NYK",
  "okla city": "OKC",
  "oklahoma city": "OKC",
  "oklahoma city thunder": "OKC",
  orlando: "ORL",
  "orlando magic": "ORL",
  philadelphia: "PHI",
  "philadelphia 76ers": "PHI",
  phoenix: "PHX",
  "phoenix suns": "PHX",
  portland: "POR",
  "portland trail blazers": "POR",
  sacramento: "SAC",
  "sacramento kings": "SAC",
  "san antonio": "SAS",
  "san antonio spurs": "SAS",
  toronto: "TOR",
  "toronto raptors": "TOR",
  utah: "UTA",
  "utah jazz": "UTA",
  washington: "WAS",
  "washington wizards": "WAS",
};

/** Abbreviation, or an exact published team label. */
export function teamFromLabel(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = canonicalTeam(trimmed);
  if (direct) return direct;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  const named = TEAM_NAMES[normalized];
  if (named) return named;
  const first = trimmed.split(/\s+/)[0] ?? "";
  return first === trimmed ? null : canonicalTeam(first);
}

export function matchupGameId(date: string, away: string, home: string): string {
  return `${date}|${away}@${home}`;
}

export function shiftDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dailyLeadersUrl(date: string): string {
  const [year, month, day] = date.split("-");
  return `https://www.basketball-reference.com/friv/dailyleaders.fcgi?month=${Number(month)}&day=${Number(day)}&year=${year}`;
}
