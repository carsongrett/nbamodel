const ALIASES: Record<string, string> = {
  BRK: "BKN",
  BKN: "BKN",
  CHO: "CHA",
  CHA: "CHA",
  GSW: "GSW",
  GS: "GSW",
  NOP: "NOP",
  NO: "NOP",
  NYK: "NYK",
  NY: "NYK",
  PHO: "PHX",
  PHX: "PHX",
  SAS: "SAS",
  SA: "SAS",
};

const NOT_A_TEAM = new Set(["TOT", "2TM", "3TM"]);

/** Exact abbreviation crosswalk. Not a name match. */
export function canonicalTeam(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(text) || NOT_A_TEAM.has(text)) return null;
  return ALIASES[text] ?? text;
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
