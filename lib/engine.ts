import { canonicalTeam, matchupGameId } from "./sources/teams";

export const CURRENT_SEASON = "2026-27";

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];
export const STATS = ["points", "rebounds", "points_rebounds"] as const;
export type Stat = (typeof STATS)[number];
export const GAME_STATUSES = ["scheduled", "in_progress", "final"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];
export const IMPORT_KINDS = [
  "teams",
  "players",
  "games",
  "id_map",
  "projections",
  "lines",
  "player_rates",
  "dvp",
  "pace",
  "opp_rebounds",
  "vegas",
  "actuals",
] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type Settings = {
  dvpPointsStrength: number;
  dvpReboundsStrength: number;
  pacePointsStrength: number;
  paceReboundsStrength: number;
  recentPointsStrength: number;
  recentReboundsStrength: number;
  minutesPointsStrength: number;
  minutesReboundsStrength: number;
  oppReboundsStrength: number;
  minRecentGames: number;
  minRateGames: number;
};

/** Active workbook divisors are column C on the model sheet, not the unused column B options. */
export const DEFAULT_SETTINGS: Settings = {
  dvpPointsStrength: 2,
  dvpReboundsStrength: 2,
  pacePointsStrength: 5,
  paceReboundsStrength: 7.5,
  recentPointsStrength: 10,
  recentReboundsStrength: 10,
  minutesPointsStrength: 3,
  minutesReboundsStrength: 2,
  oppReboundsStrength: 10,
  minRecentGames: 3,
  minRateGames: 5,
};

export type Team = { teamId: string; name: string };
export type Player = {
  playerId: string;
  displayName: string;
  teamId: string;
  position: Position;
  season: string;
};
export type Game = {
  gameId: string;
  season: string;
  gameDate: string;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  /** Tip timestamp as the source wrote it. Absent when that fetch had no start time. */
  tipAt?: string | null;
};
export type IdMap = {
  source: string;
  entityType: "player" | "team" | "game";
  sourceId: string;
  canonicalId: string;
};
export type OutsideProjection = {
  playerId: string;
  gameId: string;
  source: string;
  season: string;
  points: number | null;
  rebounds: number | null;
  minutes: number | null;
  sourceTimestamp: string | null;
};
export type PropLine = {
  playerId: string;
  gameId: string;
  stat: Stat;
  season: string;
  line: number;
  overOdds: number | null;
  underOdds: number | null;
  source: string | null;
  sourceTimestamp: string | null;
};
export type PlayerRate = {
  playerId: string;
  season: string;
  ptsPer100: number | null;
  ptsPer100Games: number | null;
  /** Basketball-Reference season usage, already in percent (28.4 means 28.4%). */
  usgPct?: number | null;
  usgGames?: number | null;
  rebPerMinute: number | null;
  rebPerMinuteGames: number | null;
  recentPointsPerGame: number | null;
  recentReboundsPerGame: number | null;
  recentGames: number | null;
  sourceTimestamp: string | null;
};
export type DvpWindow = "both" | "l15" | "l30";

export type Dvp = {
  teamId: string;
  position: Position;
  season: string;
  pointsDiff: number | null;
  reboundsDiff: number | null;
  sourceTimestamp: string | null;
  /** Which FantasyPros windows produced the differential. Absent on older rows. */
  pointsWindow?: DvpWindow | null;
  reboundsWindow?: DvpWindow | null;
};
export type PaceRow = {
  teamId: string;
  season: string;
  pace: number | null;
  paceDiff: number | null;
  sourceTimestamp: string | null;
};
export type OppRebound = {
  teamId: string;
  season: string;
  reboundDiff: number | null;
  sourceTimestamp: string | null;
};
export type Vegas = {
  gameId: string;
  teamId: string;
  season: string;
  spread: number;
  total: number;
  sourceTimestamp: string | null;
};
export type MinutesOverride = { playerId: string; gameId: string; minutes: number };
export type Actual = {
  playerId: string;
  gameId: string;
  season: string;
  dnp: boolean;
  points: number | null;
  rebounds: number | null;
  sourceTimestamp: string | null;
};
export type Finding = {
  id: string;
  slateDate: string;
  playerId: string | null;
  teamId: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  summary: string;
  kind: "verified" | "inference";
  availability: string | null;
  suggestedMinutes: number | null;
  suggestedRole: string | null;
  conflict: boolean;
  appliedAt: string | null;
  flags: string[];
};
export type Adjustment = {
  key: string;
  label: string;
  status: "applied" | "skipped";
  reason: string | null;
  input: number | null;
  strength: number | null;
  delta: number | null;
  detail: string;
};
export type StatProjection = {
  status: "ok" | "blocked";
  blockReason: string | null;
  baseline: number | null;
  sourcesUsed: string[];
  adjustments: Adjustment[];
  projection: number | null;
  flags: string[];
  minutes: number | null;
};
export type PregameStat = {
  playerId: string;
  gameId: string;
  stat: Stat;
  slateDate: string;
  baseline: number | null;
  projection: number | null;
  minutes: number | null;
  adjustments: Adjustment[];
  flags: string[];
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
  savedAt: string;
  sourcesUsed: string[];
};
export type Database = {
  teams: Team[];
  players: Player[];
  games: Game[];
  idMap: IdMap[];
  projections: OutsideProjection[];
  lines: PropLine[];
  rates: PlayerRate[];
  dvp: Dvp[];
  pace: PaceRow[];
  oppRebounds: OppRebound[];
  vegas: Vegas[];
  settings: Settings;
  overrides: MinutesOverride[];
  pregame: PregameStat[];
  actuals: Actual[];
  research: Finding[];
};

export type Grade = "win" | "loss" | "push" | "no_pick" | "dnp" | "unresolved" | "ungraded";
export type PickSide = "over" | "under" | "none";

const PRIOR_SEASON_COLUMNS = [
  "prior_season_ppg",
  "prior_season_rpg",
  "prior_pts_per_100",
  "prior_reb_per_minute",
  "last_season_ppg",
  "last_season_rpg",
];

export function emptyDatabase(): Database {
  return {
    teams: [],
    players: [],
    games: [],
    idMap: [],
    projections: [],
    lines: [],
    rates: [],
    dvp: [],
    pace: [],
    oppRebounds: [],
    vegas: [],
    settings: { ...DEFAULT_SETTINGS },
    overrides: [],
    pregame: [],
    actuals: [],
    research: [],
  };
}

export function chicagoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function chicagoDateOf(timestamp: string): string | null {
  const trimmed = timestamp.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return chicagoToday(date);
}

/** ESPN writes the tip in UTC. The row shows that instant in America/Chicago, labeled CT. */
export function tipLabel(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const trimmed = timestamp.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const suffix = parts.find((part) => part.type === "dayPeriod")?.value.toUpperCase();
  if (!hour || !minute || (suffix !== "AM" && suffix !== "PM")) return null;
  return `${hour}:${minute} ${suffix} CT`;
}

/** Keep a stored tip when the incoming game has none, and keep a final status. */
export function mergeGame(existing: Game | undefined, incoming: Game): Game {
  if (!existing) return incoming;
  return {
    ...incoming,
    status: existing.status === "final" ? "final" : incoming.status,
    tipAt: incoming.tipAt ?? existing.tipAt ?? null,
  };
}

function byTipThenLabel(a: SlateGame, b: SlateGame): number {
  const left = a.tipAt ? Date.parse(a.tipAt) : Number.NaN;
  const right = b.tipAt ? Date.parse(b.tipAt) : Number.NaN;
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (leftOk && rightOk && left !== right) return left - right;
  if (leftOk !== rightOk) return leftOk ? -1 : 1;
  return a.label.localeCompare(b.label);
}

export function freshnessFlag(label: string, timestamp: string | null, slateDate: string): string | null {
  if (!timestamp) return `Missing timestamp: ${label}.`;
  const day = chicagoDateOf(timestamp);
  if (!day) return `Missing timestamp: ${label}.`;
  if (day !== slateDate) return `Stale: ${label} is dated ${day}, not ${slateDate}.`;
  return null;
}

/** Signed team spread: negative means that team is favored. Half the spread, shown as context. */
export function impliedTeamPoints(gameTotal: number, signedTeamSpread: number): number {
  return (gameTotal - signedTeamSpread) / 2;
}

/**
 * Team points inside the minutes weight.
 * Favorite spread is negative: add that size to half the total when favored, subtract it otherwise.
 */
export function favoredTeamPoints(gameTotal: number, signedTeamSpread: number): number {
  const half = gameTotal / 2;
  const size = Math.abs(signedTeamSpread);
  return signedTeamSpread < 0 ? half + size : half - size;
}

export function weightedDvp(l30Diff: number, l15Diff: number): number {
  return l30Diff * 0.3 + l15Diff * 0.7;
}

export function dvpWindowNote(window: DvpWindow | null | undefined): string | null {
  if (window === "l15") return "Last 30 was missing. Last 15 is the defense vs position number.";
  if (window === "l30") return "Last 15 was missing. Last 30 is the defense vs position number.";
  return null;
}

export type DefenseWindowRow = {
  teamId: string;
  position: Position;
  points: number | null;
  rebounds: number | null;
};

export type DefenseDiff = {
  teamId: string;
  position: Position;
  pointsDiff: number | null;
  reboundsDiff: number | null;
  pointsWindow: DvpWindow | null;
  reboundsWindow: DvpWindow | null;
};

function windowKey(teamId: string, position: Position): string {
  return `${teamId}|${position}`;
}

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Each window is the team's cell minus that window's position average.
 * Both windows blend last 30 at 30% and last 15 at 70%. One window is used whole.
 */
export function defenseVsPosition(l30Rows: DefenseWindowRow[], l15Rows: DefenseWindowRow[]): DefenseDiff[] {
  const l30 = new Map(l30Rows.map((row) => [windowKey(row.teamId, row.position), row]));
  const l15 = new Map(l15Rows.map((row) => [windowKey(row.teamId, row.position), row]));
  const keys = new Set([...l30.keys(), ...l15.keys()]);
  const byPosition = new Map<Position, string[]>();
  for (const key of keys) {
    const position = key.split("|")[1] as Position;
    const list = byPosition.get(position) ?? [];
    list.push(key);
    byPosition.set(position, list);
  }
  const out: DefenseDiff[] = [];
  for (const [position, group] of byPosition) {
    const points30 = group.map((key) => l30.get(key)?.points).filter((value): value is number => value != null);
    const points15 = group.map((key) => l15.get(key)?.points).filter((value): value is number => value != null);
    const rebounds30 = group.map((key) => l30.get(key)?.rebounds).filter((value): value is number => value != null);
    const rebounds15 = group.map((key) => l15.get(key)?.rebounds).filter((value): value is number => value != null);
    const pointsMean30 = meanOf(points30);
    const pointsMean15 = meanOf(points15);
    const reboundsMean30 = meanOf(rebounds30);
    const reboundsMean15 = meanOf(rebounds15);
    for (const key of group) {
      const teamId = key.slice(0, key.lastIndexOf("|"));
      const rawPoints30 = l30.get(key)?.points ?? null;
      const rawPoints15 = l15.get(key)?.points ?? null;
      const rawRebounds30 = l30.get(key)?.rebounds ?? null;
      const rawRebounds15 = l15.get(key)?.rebounds ?? null;
      const points = blendWindowDiff(rawPoints30, pointsMean30, rawPoints15, pointsMean15);
      const rebounds = blendWindowDiff(rawRebounds30, reboundsMean30, rawRebounds15, reboundsMean15);
      if (points.value == null && rebounds.value == null) continue;
      out.push({
        teamId,
        position,
        pointsDiff: points.value,
        reboundsDiff: rebounds.value,
        pointsWindow: points.window,
        reboundsWindow: rebounds.window,
      });
    }
  }
  return out;
}

function blendWindowDiff(
  l30: number | null,
  l30Mean: number | null,
  l15: number | null,
  l15Mean: number | null,
): { value: number | null; window: DvpWindow | null } {
  const d30 = l30 != null && l30Mean != null ? l30 - l30Mean : null;
  const d15 = l15 != null && l15Mean != null ? l15 - l15Mean : null;
  if (d30 != null && d15 != null) return { value: weightedDvp(d30, d15), window: "both" };
  if (d15 != null) return { value: d15, window: "l15" };
  if (d30 != null) return { value: d30, window: "l30" };
  return { value: null, window: null };
}

export function opponentReboundDiffs(rows: { teamId: string; season: number; last3: number }[]): { teamId: string; reboundDiff: number }[] {
  if (rows.length === 0) return [];
  const blends = rows.map((row) => weightedOppReboundDiff(row.season, row.last3, 0));
  const league = blends.reduce((sum, value) => sum + value, 0) / blends.length;
  return rows.map((row, index) => ({ teamId: row.teamId, reboundDiff: blends[index] - league }));
}

/** Saved numbers stay. A missing key uses the current default. */
export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const next = { ...DEFAULT_SETTINGS };
  if (!saved) return next;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

export function weightedPace(l10: number, season: number): number {
  return l10 * 0.75 + season * 0.25;
}

export function weightedPaceDiff(l10: number, l10League: number, season: number, seasonLeague: number): number {
  return (l10 - l10League) * 0.75 + (season - seasonLeague) * 0.25;
}

export function weightedOppReboundDiff(seasonRpg: number, last3Rpg: number, leagueBlendAverage: number): number {
  return seasonRpg * 0.85 + last3Rpg * 0.15 - leagueBlendAverage;
}

export function blendedReboundsPerMinute(trbPer36: number, recentPerMinute: number): number {
  return (trbPer36 / 36) * 0.5 + recentPerMinute * 0.5;
}

export function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function upsertByKey<T>(
  existing: T[],
  incoming: T[],
  keyFn: (row: T) => string,
): { rows: T[]; inserted: number; updated: number } {
  const index = new Map(existing.map((row, i) => [keyFn(row), i]));
  const rows = existing.slice();
  let inserted = 0;
  let updated = 0;
  for (const row of incoming) {
    const key = keyFn(row);
    const at = index.get(key);
    if (at == null) {
      index.set(key, rows.length);
      rows.push(row);
      inserted++;
    } else {
      rows[at] = row;
      updated++;
    }
  }
  return { rows, inserted, updated };
}

export function idsEqual(a: string, b: string): boolean {
  return a === b;
}

type SourceValue = { source: string; value: number | null };

export type PointsInput = {
  sources: SourceValue[];
  projectedMinutes: number | null;
  ptsPer100: number | null;
  ptsPer100Games: number | null;
  recentPerGame: number | null;
  recentGames: number | null;
  dvpDiff: number | null;
  /** Set when FantasyPros had only one of the last-30 and last-15 windows. */
  dvpNote?: string | null;
  paceDiff: number | null;
  gamePace: number | null;
  gamePacePartial: boolean;
  /** Half the total, plus the spread when favored and minus it when not. */
  teamPoints?: number | null;
  /** Season usage in percent, from Basketball-Reference. Not points per 100 possessions. */
  usgPct?: number | null;
  usgGames?: number | null;
  strengths: Settings;
  /** Points line. Used only in the last-15 and minutes-share weights. */
  line?: number | null;
};

export type ReboundsInput = {
  sources: SourceValue[];
  projectedMinutes: number | null;
  rebPerMinute: number | null;
  rebPerMinuteGames: number | null;
  recentPerGame: number | null;
  recentGames: number | null;
  dvpDiff: number | null;
  /** Set when FantasyPros had only one of the last-30 and last-15 windows. */
  dvpNote?: string | null;
  paceDiff: number | null;
  oppReboundDiff: number | null;
  strengths: Settings;
  line?: number | null;
};

function roundDetail(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

function skip(key: string, label: string, reason: string, strength: number | null = null): Adjustment {
  return {
    key,
    label,
    status: "skipped",
    reason,
    input: null,
    strength,
    delta: null,
    detail: `${label} skipped — ${reason}.`,
  };
}

function sampleGate(games: number | null, minimum: number, label: string): string | null {
  if (games == null) return `${label} sample size was not provided`;
  if (games < minimum) return `${label} has ${games} games, below the minimum of ${minimum}`;
  return null;
}

export const SPORTSLINE_BASELINE_WEIGHT = 0.65;
export const DIMERS_BASELINE_WEIGHT = 0.35;

const SPORTSLINE_SOURCE = "sportsline";
const DIMERS_SOURCE = "dimers";

function finiteSource(sources: SourceValue[], name: string): number | null {
  const value = sources.find((source) => source.source === name)?.value;
  return value != null && Number.isFinite(value) ? value : null;
}

function sportslineStep(value: number): Adjustment {
  return {
    key: "sportsline",
    label: "SL projection",
    status: "applied",
    reason: null,
    input: value,
    strength: null,
    delta: null,
    detail: `SportsLine ${roundDetail(value)}.`,
  };
}

function outsideBaseline(sources: SourceValue[], stat: "points" | "rebounds", flags: string[]): {
  baseline: number | null;
  sourcesUsed: string[];
  preface: Adjustment[];
} {
  if (sources.some((source) => source.source === "numberfire" && source.value != null)) {
    flags.push("NumberFire projections are not used.");
  }
  const sportsline = finiteSource(sources, SPORTSLINE_SOURCE);
  const dimers = finiteSource(sources, DIMERS_SOURCE);
  const dimersKnown = sources.some((source) => source.source === DIMERS_SOURCE);
  const others = sources.filter((source) =>
    source.source !== "numberfire"
    && source.source !== SPORTSLINE_SOURCE
    && source.source !== DIMERS_SOURCE
    && source.value != null
    && Number.isFinite(source.value));
  const title = stat === "points" ? "Points" : "Rebounds";

  if (sportsline != null && dimers != null) {
    const baseline = sportsline * SPORTSLINE_BASELINE_WEIGHT + dimers * DIMERS_BASELINE_WEIGHT;
    return {
      baseline,
      sourcesUsed: [SPORTSLINE_SOURCE, DIMERS_SOURCE],
      preface: [
        sportslineStep(sportsline),
        {
          key: "dimers",
          label: "Dimers",
          status: "applied",
          reason: null,
          input: dimers,
          strength: DIMERS_BASELINE_WEIGHT,
          delta: null,
          detail: `Dimers ${roundDetail(dimers)}. Weight 65/35: SportsLine × ${SPORTSLINE_BASELINE_WEIGHT} + Dimers × ${DIMERS_BASELINE_WEIGHT} = ${roundDetail(baseline)}.`,
        },
      ],
    };
  }

  if (dimersKnown && sportsline != null && dimers == null) {
    const note = `Dimers ${stat} are missing. SportsLine is the full ${stat} baseline.`;
    flags.push(note);
    return {
      baseline: sportsline,
      sourcesUsed: [SPORTSLINE_SOURCE],
      preface: [
        sportslineStep(sportsline),
        {
          key: "dimers",
          label: "Dimers",
          status: "skipped",
          reason: `Dimers ${stat} are missing`,
          input: null,
          strength: null,
          delta: null,
          detail: note,
        },
      ],
    };
  }

  if (dimers != null && sportsline == null) {
    const note = `SportsLine ${stat} are missing. Dimers is the full ${stat} baseline.`;
    flags.push(note);
    return {
      baseline: dimers,
      sourcesUsed: [DIMERS_SOURCE],
      preface: [{
        key: "dimers",
        label: "Dimers",
        status: "applied",
        reason: null,
        input: dimers,
        strength: null,
        delta: null,
        detail: note,
      }],
    };
  }

  const used = [
    ...(sportsline != null ? [{ source: SPORTSLINE_SOURCE, value: sportsline }] : []),
    ...others.map((source) => ({ source: source.source, value: source.value as number })),
  ];
  const baseline = average(used.map((source) => source.value));
  const sourcesUsed = used.map((source) => source.source);
  if (sourcesUsed.length === 1) flags.push(`${title} baseline uses one outside source.`);
  return { baseline, sourcesUsed, preface: [] };
}

export function projectPoints(input: PointsInput): StatProjection {
  const flags: string[] = [];
  const { baseline, sourcesUsed, preface } = outsideBaseline(input.sources, "points", flags);
  if (baseline == null) {
    return {
      status: "blocked",
      blockReason: "No outside points projections for this player and game.",
      baseline: null,
      sourcesUsed,
      adjustments: [],
      projection: null,
      flags,
      minutes: input.projectedMinutes,
    };
  }
  const s = input.strengths;
  const adjustments: Adjustment[] = [...preface];

  adjustments.push(dvpAdjustment("points", input.dvpDiff, input.dvpNote, s.dvpPointsStrength, flags));

  adjustments.push(paceAdjustment(input.paceDiff, s.pacePointsStrength));

  const recentSample = input.recentPerGame == null
    ? "recent points per game is missing"
    : sampleGate(input.recentGames, s.minRecentGames, "Recent points");
  const recentReason = recentSample ?? (input.line == null ? "points line is missing" : null);
  if (recentReason) adjustments.push(skip("recent", "Recent performance", recentReason, s.recentPointsStrength));
  else {
    const recent = input.recentPerGame as number;
    const line = input.line as number;
    const delta = (recent - line) / s.recentPointsStrength;
    adjustments.push({
      key: "recent",
      label: "Recent performance",
      status: "applied",
      reason: null,
      input: recent - line,
      strength: s.recentPointsStrength,
      delta,
      detail: `(${roundDetail(recent)} last-15 points per game − ${roundDetail(line)} points line) / ${s.recentPointsStrength} = ${roundDetail(delta)}.`,
    });
  }

  adjustments.push(pointsMinutesAdjustment(input));
  const minutesAdj = adjustments[adjustments.length - 1];
  if (minutesAdj.reason?.includes("mis-scaled")) flags.push(minutesAdj.reason);

  const projection = baseline + adjustments.reduce((sum, adj) => sum + (adj.delta ?? 0), 0);
  return {
    status: "ok",
    blockReason: null,
    baseline,
    sourcesUsed,
    adjustments,
    projection,
    flags,
    minutes: input.projectedMinutes,
  };
}

function dvpAdjustment(stat: "points" | "rebounds", diff: number | null, note: string | null | undefined, strength: number, flags: string[]): Adjustment {
  const label = "Defense vs position";
  if (diff == null) return skip("dvp", label, "opponent defense vs position is missing", strength);
  const delta = diff / strength;
  const noun = stat === "points" ? "points" : "rebounds";
  if (note) flags.push(note);
  return {
    key: "dvp",
    label,
    status: "applied",
    reason: null,
    input: diff,
    strength,
    delta,
    detail: `${roundDetail(diff)} ${noun} vs position / ${strength} = ${roundDetail(delta)}.${note ? ` ${note}` : ""}`,
  };
}

function oppReboundsAdjustment(diff: number | null, strength: number): Adjustment {
  const label = "Opponent rebounds allowed";
  if (diff == null) return skip("opp_rebounds", label, "opponent rebounds are missing", strength);
  const delta = diff / strength;
  return {
    key: "opp_rebounds",
    label,
    status: "applied",
    reason: null,
    input: diff,
    strength,
    delta,
    detail: `${roundDetail(diff)} rebounds versus the league blend / ${strength} = ${roundDetail(delta)}.`,
  };
}

function paceAdjustment(diff: number | null, strength: number): Adjustment {
  if (diff == null) return skip("pace", "Pace", "opponent pace is missing", strength);
  const delta = diff / strength;
  return {
    key: "pace",
    label: "Pace",
    status: "applied",
    reason: null,
    input: diff,
    strength,
    delta,
    detail: `${roundDetail(diff)} possessions versus the league / ${strength} = ${roundDetail(delta)}.`,
  };
}

function pointsMinutesAdjustment(input: PointsInput): Adjustment {
  const strength = input.strengths.minutesPointsStrength;
  const label = "Minutes";
  if (input.usgPct == null) {
    return skip("minutes", label, "usage percent is missing. Points per 100 possessions are not used as a share of team points", strength);
  }
  if (input.usgPct <= 1.5 || input.usgPct > 60) {
    return skip("minutes", label, `usage percent (${input.usgPct}) looks mis-scaled and was not applied`, strength);
  }
  const sample = sampleGate(input.usgGames ?? null, input.strengths.minRateGames, "Usage");
  if (sample) return skip("minutes", label, sample, strength);
  if (input.projectedMinutes == null) return skip("minutes", label, "projected minutes are missing", strength);
  if (input.teamPoints == null) return skip("minutes", label, "team points are missing", strength);
  if (input.line == null) return skip("minutes", label, "points line is missing", strength);
  const share = input.teamPoints * (input.projectedMinutes / 48) * (input.usgPct / 100);
  const delta = (share - input.line) / strength;
  return {
    key: "minutes",
    label,
    status: "applied",
    reason: null,
    input: share - input.line,
    strength,
    delta,
    detail: `${roundDetail(input.teamPoints)} team points × ${roundDetail(input.projectedMinutes)}/48 × ${roundDetail(input.usgPct)}/100 = ${roundDetail(share)}. (${roundDetail(share)} − ${roundDetail(input.line)} points line) / ${strength} = ${roundDetail(delta)}.`,
  };
}

export function projectRebounds(input: ReboundsInput): StatProjection {
  const flags: string[] = [];
  const { baseline, sourcesUsed, preface } = outsideBaseline(input.sources, "rebounds", flags);
  if (baseline == null) {
    return {
      status: "blocked",
      blockReason: "No outside rebounds projections for this player and game.",
      baseline: null,
      sourcesUsed,
      adjustments: [],
      projection: null,
      flags,
      minutes: input.projectedMinutes,
    };
  }
  const s = input.strengths;
  const adjustments: Adjustment[] = [...preface];

  adjustments.push(dvpAdjustment("rebounds", input.dvpDiff, input.dvpNote, s.dvpReboundsStrength, flags));

  adjustments.push(paceAdjustment(input.paceDiff, s.paceReboundsStrength));

  const sportsline = finiteSource(input.sources, SPORTSLINE_SOURCE);
  const anchor = sportsline ?? baseline;
  const anchorLabel = sportsline != null ? "SportsLine rebounds" : "outside rebounds";
  const recentReason = input.recentPerGame == null
    ? "recent rebounds per game is missing"
    : sampleGate(input.recentGames, s.minRecentGames, "Recent rebounds");
  if (recentReason || anchor == null) {
    adjustments.push(skip("recent", "Recent performance", recentReason ?? "outside rebounds are missing", s.recentReboundsStrength));
  } else {
    const recent = input.recentPerGame as number;
    const delta = (recent - anchor) / s.recentReboundsStrength;
    adjustments.push({
      key: "recent",
      label: "Recent performance",
      status: "applied",
      reason: null,
      input: recent - anchor,
      strength: s.recentReboundsStrength,
      delta,
      detail: `(${roundDetail(recent)} last-15 rebounds per game − ${roundDetail(anchor)} ${anchorLabel}) / ${s.recentReboundsStrength} = ${roundDetail(delta)}.`,
    });
  }

  adjustments.push(reboundsMinutesAdjustment(input, anchor, anchorLabel));
  adjustments.push(oppReboundsAdjustment(input.oppReboundDiff, s.oppReboundsStrength));

  const projection = baseline + adjustments.reduce((sum, adj) => sum + (adj.delta ?? 0), 0);
  return {
    status: "ok",
    blockReason: null,
    baseline,
    sourcesUsed,
    adjustments,
    projection,
    flags,
    minutes: input.projectedMinutes,
  };
}

function reboundsMinutesAdjustment(input: ReboundsInput, anchor: number | null, anchorLabel: string): Adjustment {
  const strength = input.strengths.minutesReboundsStrength;
  const label = "Minutes";
  if (input.rebPerMinute == null) return skip("minutes", label, "rebounds per minute is missing", strength);
  if (input.rebPerMinute < 0 || input.rebPerMinute > 1.2) {
    return skip("minutes", label, `rebounds per minute (${input.rebPerMinute}) looks mis-scaled. Expected rebounds per minute, not per 36 or per game`, strength);
  }
  const sample = sampleGate(input.rebPerMinuteGames, input.strengths.minRateGames, "Rebounds per minute");
  if (sample) return skip("minutes", label, sample, strength);
  if (input.projectedMinutes == null) return skip("minutes", label, "projected minutes are missing", strength);
  if (anchor == null) return skip("minutes", label, "outside rebounds are missing", strength);
  const expected = input.rebPerMinute * input.projectedMinutes;
  const delta = (expected - anchor) / strength;
  return {
    key: "minutes",
    label,
    status: "applied",
    reason: null,
    input: expected - anchor,
    strength,
    delta,
    detail: `${roundDetail(input.rebPerMinute)} rebounds per minute × ${roundDetail(input.projectedMinutes)} minutes = ${roundDetail(expected)}. (${roundDetail(expected)} − ${roundDetail(anchor)} ${anchorLabel}) / ${strength} = ${roundDetail(delta)}.`,
  };
}

export function projectPointsPlusRebounds(points: StatProjection, rebounds: StatProjection): StatProjection {
  if (points.status !== "ok" || rebounds.status !== "ok" || points.projection == null || rebounds.projection == null) {
    const why = [points.blockReason, rebounds.blockReason].filter(Boolean).join(" ");
    return {
      status: "blocked",
      blockReason: why || "Points + rebounds needs both projections.",
      baseline: null,
      sourcesUsed: [],
      adjustments: [],
      projection: null,
      flags: [...points.flags, ...rebounds.flags],
      minutes: points.minutes ?? rebounds.minutes,
    };
  }
  return {
    status: "ok",
    blockReason: null,
    baseline: null,
    sourcesUsed: [],
    adjustments: [
      {
        key: "points",
        label: "Projected points",
        status: "applied",
        reason: null,
        input: points.projection,
        strength: null,
        delta: points.projection,
        detail: `Projected points ${roundDetail(points.projection)}.`,
      },
      {
        key: "rebounds",
        label: "Projected rebounds",
        status: "applied",
        reason: null,
        input: rebounds.projection,
        strength: null,
        delta: rebounds.projection,
        detail: `Projected rebounds ${roundDetail(rebounds.projection)}.`,
      },
    ],
    projection: points.projection + rebounds.projection,
    flags: [...new Set([...points.flags, ...rebounds.flags])],
    minutes: points.minutes,
  };
}

export function edgeAndPick(projection: number | null, line: number | null): {
  edge: number | null;
  pick: PickSide | null;
} {
  if (projection == null || line == null) return { edge: null, pick: null };
  if (sameNumber(projection, line)) return { edge: 0, pick: "none" };
  return { edge: projection - line, pick: projection > line ? "over" : "under" };
}

export function gradeResult(input: {
  projection: number | null;
  line: number | null;
  actual: number | null;
  dnp: boolean;
  gameFinal: boolean;
}): { grade: Grade; pick: PickSide | null; error: number | null } {
  if (input.dnp) return { grade: "dnp", pick: null, error: null };
  if (!input.gameFinal || input.actual == null) return { grade: "unresolved", pick: null, error: null };
  const error = input.projection == null ? null : input.actual - input.projection;
  if (input.projection == null || input.line == null) return { grade: "ungraded", pick: null, error };
  const pick: PickSide = sameNumber(input.projection, input.line) ? "none" : input.projection > input.line ? "over" : "under";
  if (pick === "none") return { grade: "no_pick", pick, error };
  if (sameNumber(input.actual, input.line)) return { grade: "push", pick, error };
  const actualOver = input.actual > input.line;
  const win = (pick === "over" && actualOver) || (pick === "under" && !actualOver);
  return { grade: win ? "win" : "loss", pick, error };
}

export type Summary = {
  eligible: number;
  wins: number;
  losses: number;
  pushes: number;
  noPicks: number;
  dnps: number;
  unresolved: number;
  ungraded: number;
  winRate: number | null;
  meanAbsoluteError: number | null;
};

export function summarize(rows: { grade: Grade; error: number | null }[]): Summary {
  const count = (grade: Grade) => rows.filter((row) => row.grade === grade).length;
  const wins = count("win");
  const losses = count("loss");
  const eligible = wins + losses;
  const errors = rows
    .filter((row) => row.error != null && row.grade !== "dnp" && row.grade !== "unresolved")
    .map((row) => Math.abs(row.error as number));
  return {
    eligible,
    wins,
    losses,
    pushes: count("push"),
    noPicks: count("no_pick"),
    dnps: count("dnp"),
    unresolved: count("unresolved"),
    ungraded: count("ungraded"),
    winRate: eligible === 0 ? null : wins / eligible,
    meanAbsoluteError: errors.length === 0 ? null : errors.reduce((s, n) => s + n, 0) / errors.length,
  };
}

type Raw = Record<string, string>;

export type ImportIssue = { row: number; message: string };
export type ImportResult = {
  kind: ImportKind;
  inserted: number;
  updated: number;
  rejected: number;
  warnings: string[];
  errors: ImportIssue[];
  db: Database;
};

function seasonError(values: Raw): string | null {
  const season = values.season?.trim() ?? "";
  if (!season) return "season is required";
  if (season !== CURRENT_SEASON) {
    return `season ${season} is not ${CURRENT_SEASON}. Prior-season stats are not imported or substituted.`;
  }
  return null;
}

function priorWarning(values: Raw): string | null {
  const present = PRIOR_SEASON_COLUMNS.filter((key) => (values[key] ?? "").trim() !== "");
  if (present.length === 0) return null;
  return `Ignored prior-season columns (${present.join(", ")}). They were not used.`;
}

function num(values: Raw, key: string): { value: number | null } | { error: string } {
  const raw = (values[key] ?? "").trim();
  if (raw === "") return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: `${key} is not a number` };
  return { value };
}

function int(values: Raw, key: string): { value: number | null } | { error: string } {
  const parsed = num(values, key);
  if ("error" in parsed) return parsed;
  if (parsed.value == null) return { value: null };
  if (!Number.isInteger(parsed.value)) return { error: `${key} must be a whole number` };
  return parsed;
}

function timestamp(values: Raw, key = "source_timestamp"): { value: string | null } | { error: string } {
  const raw = (values[key] ?? "").trim();
  if (raw === "") return { value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { value: raw };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: `${key} is not a valid date` };
  return { value: date.toISOString() };
}

function requireNum(values: Raw, key: string): { value: number } | { error: string } {
  const parsed = num(values, key);
  if ("error" in parsed) return parsed;
  if (parsed.value == null) return { error: `${key} is required` };
  return { value: parsed.value };
}

function resolveId(
  values: Raw,
  entity: "player" | "team" | "game",
  maps: IdMap[],
): { id: string } | { error: string } {
  const canonicalKey = entity === "player" ? "player_id" : entity === "team" ? "team_id" : "game_id";
  const sourceKey = entity === "player" ? "source_player_id" : entity === "team" ? "source_team_id" : "source_game_id";
  const canonical = (values[canonicalKey] ?? "").trim();
  const sourceId = (values[sourceKey] ?? "").trim();
  const source = (values.source ?? "").trim();
  const nameKey = entity === "player" ? "player_name" : entity === "team" ? "team_name" : "game_name";
  if (!canonical && !sourceId) {
    const name = (values[nameKey] ?? values.name ?? "").trim();
    if (name) return { error: `${canonicalKey} is required. "${name}" was not matched by name.` };
    return { error: `${canonicalKey} is required. Approximate name matching is not used.` };
  }
  if (sourceId) {
    if (!source) return { error: `source is required with ${sourceKey}` };
    const mapped = maps.find((m) => m.source === source && m.entityType === entity && idsEqual(m.sourceId, sourceId));
    if (!mapped) return { error: `No exact ${entity} mapping for source "${source}" id "${sourceId}".` };
    if (canonical && !idsEqual(canonical, mapped.canonicalId)) {
      return { error: `${canonicalKey} does not match the source-id mapping.` };
    }
    return { id: mapped.canonicalId };
  }
  return { id: canonical };
}

function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

function isStat(value: string): value is Stat {
  return (STATS as readonly string[]).includes(value);
}

function parsedError(items: Array<{ error: string } | { value: unknown }>): string | null {
  for (const item of items) if ("error" in item) return item.error;
  return null;
}

function val<T>(parsed: { value: T } | { error: string }): T {
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.value;
}

function odds(values: Raw, key: string): { value: number | null } | { error: string } {
  const parsed = int(values, key);
  if ("error" in parsed) return parsed;
  if (parsed.value == null) return { value: null };
  if (parsed.value > -100 && parsed.value < 100) return { error: `${key} must be American odds, at or beyond 100` };
  return parsed;
}

export function importRecords(db: Database, kind: ImportKind, rows: { rowNumber: number; values: Raw }[]): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: string[] = [];
  let inserted = 0;
  let updated = 0;
  const next: Database = {
    ...db,
    teams: db.teams.slice(),
    players: db.players.slice(),
    games: db.games.slice(),
    idMap: db.idMap.slice(),
    projections: db.projections.slice(),
    lines: db.lines.slice(),
    rates: db.rates.slice(),
    dvp: db.dvp.slice(),
    pace: db.pace.slice(),
    oppRebounds: db.oppRebounds.slice(),
    vegas: db.vegas.slice(),
    actuals: db.actuals.slice(),
  };

  const take = <T>(current: T[], incoming: T[], keyFn: (row: T) => string) => {
    const result = upsertByKey(current, incoming, keyFn);
    inserted += result.inserted;
    updated += result.updated;
    return result.rows;
  };

  if (kind === "teams") {
    const incoming: Team[] = [];
    for (const row of rows) {
      const teamId = row.values.team_id?.trim() ?? "";
      const name = row.values.name?.trim() || row.values.team_name?.trim() || "";
      if (!teamId || !name) errors.push({ row: row.rowNumber, message: "team_id and name are required." });
      else incoming.push({ teamId, name });
    }
    next.teams = take(next.teams, incoming, (r) => r.teamId);
  } else if (kind === "id_map") {
    const incoming: IdMap[] = [];
    for (const row of rows) {
      const source = row.values.source?.trim() ?? "";
      const entityType = row.values.entity_type?.trim() ?? "";
      const sourceId = row.values.source_id?.trim() ?? "";
      const canonicalId = row.values.canonical_id?.trim() ?? "";
      if (!source || !sourceId || !canonicalId) {
        errors.push({ row: row.rowNumber, message: "source, source_id, and canonical_id are required." });
        continue;
      }
      if (entityType !== "player" && entityType !== "team" && entityType !== "game") {
        errors.push({ row: row.rowNumber, message: "entity_type must be player, team, or game." });
        continue;
      }
      incoming.push({ source, entityType, sourceId, canonicalId });
    }
    next.idMap = take(next.idMap, incoming, (r) => `${r.source}|${r.entityType}|${r.sourceId}`);
  } else if (kind === "players") {
    const incoming: Player[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const id = resolveId(row.values, "player", next.idMap);
      if ("error" in id) {
        errors.push({ row: row.rowNumber, message: id.error });
        continue;
      }
      const team = resolveId(row.values, "team", next.idMap);
      if ("error" in team) {
        errors.push({ row: row.rowNumber, message: team.error });
        continue;
      }
      const position = (row.values.position ?? "").trim().toUpperCase();
      const displayName = (row.values.display_name ?? row.values.player_name ?? "").trim();
      if (!displayName) {
        errors.push({ row: row.rowNumber, message: "display_name is required." });
        continue;
      }
      if (!isPosition(position)) {
        errors.push({ row: row.rowNumber, message: "position must be PG, SG, SF, PF, or C." });
        continue;
      }
      incoming.push({ playerId: id.id, displayName, teamId: team.id, position, season: CURRENT_SEASON });
    }
    next.players = take(next.players, incoming, (r) => r.playerId);
  } else if (kind === "games") {
    const incoming: Game[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const id = resolveId(row.values, "game", next.idMap);
      const home = resolveId({ ...row.values, team_id: row.values.home_team_id, source_team_id: row.values.source_home_team_id }, "team", next.idMap);
      const away = resolveId({ ...row.values, team_id: row.values.away_team_id, source_team_id: row.values.source_away_team_id }, "team", next.idMap);
      if ("error" in id || "error" in home || "error" in away) {
        errors.push({ row: row.rowNumber, message: ("error" in id ? id.error : "error" in home ? home.error : (away as { error: string }).error) });
        continue;
      }
      const gameDate = (row.values.game_date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
        errors.push({ row: row.rowNumber, message: "game_date must be YYYY-MM-DD." });
        continue;
      }
      const status = (row.values.status ?? "").trim();
      if (!(GAME_STATUSES as readonly string[]).includes(status)) {
        errors.push({ row: row.rowNumber, message: "status must be scheduled, in_progress, or final." });
        continue;
      }
      if (home.id === away.id) {
        errors.push({ row: row.rowNumber, message: "home and away teams must be different." });
        continue;
      }
      const prior = next.games.find((game) => game.gameId === id.id);
      incoming.push({
        gameId: id.id,
        season: CURRENT_SEASON,
        gameDate,
        homeTeamId: home.id,
        awayTeamId: away.id,
        status: status as GameStatus,
        tipAt: prior?.tipAt ?? null,
      });
    }
    next.games = take(next.games, incoming, (r) => r.gameId);
  } else if (kind === "projections") {
    const incoming: OutsideProjection[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const warning = priorWarning(row.values);
      if (warning) warnings.push(`Row ${row.rowNumber}: ${warning}`);
      const player = resolveId(row.values, "player", next.idMap);
      const game = resolveId(row.values, "game", next.idMap);
      if ("error" in player || "error" in game) {
        errors.push({ row: row.rowNumber, message: "error" in player ? player.error : (game as { error: string }).error });
        continue;
      }
      const source = (row.values.source ?? "").trim();
      if (!source) {
        errors.push({ row: row.rowNumber, message: "source is required." });
        continue;
      }
      const points = num(row.values, "points");
      const rebounds = num(row.values, "rebounds");
      const minutes = num(row.values, "minutes");
      const stamped = timestamp(row.values);
      const bad = parsedError([points, rebounds, minutes, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      if (val(points) == null && val(rebounds) == null && val(minutes) == null) {
        errors.push({ row: row.rowNumber, message: "A projection needs points, rebounds, or minutes." });
        continue;
      }
      incoming.push({
        playerId: player.id,
        gameId: game.id,
        source,
        season: CURRENT_SEASON,
        points: val(points),
        rebounds: val(rebounds),
        minutes: val(minutes),
        sourceTimestamp: val(stamped),
      });
    }
    next.projections = take(next.projections, incoming, (r) => `${r.playerId}|${r.gameId}|${r.source}`);
  } else if (kind === "lines") {
    const incoming: PropLine[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const player = resolveId(row.values, "player", next.idMap);
      const game = resolveId(row.values, "game", next.idMap);
      if ("error" in player || "error" in game) {
        errors.push({ row: row.rowNumber, message: "error" in player ? player.error : (game as { error: string }).error });
        continue;
      }
      const stat = (row.values.stat ?? "").trim();
      if (!isStat(stat)) {
        errors.push({ row: row.rowNumber, message: "stat must be points, rebounds, or points_rebounds." });
        continue;
      }
      const line = requireNum(row.values, "line");
      const over = odds(row.values, "over_odds");
      const under = odds(row.values, "under_odds");
      const stamped = timestamp(row.values);
      const bad = parsedError([line, over, under, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      incoming.push({
        playerId: player.id,
        gameId: game.id,
        stat,
        season: CURRENT_SEASON,
        line: val(line),
        overOdds: val(over),
        underOdds: val(under),
        source: (row.values.source ?? "").trim() || null,
        sourceTimestamp: val(stamped),
      });
    }
    next.lines = take(next.lines, incoming, (r) => `${r.playerId}|${r.gameId}|${r.stat}`);
  } else if (kind === "player_rates") {
    const incoming: PlayerRate[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const warning = priorWarning(row.values);
      if (warning) warnings.push(`Row ${row.rowNumber}: ${warning}`);
      const player = resolveId(row.values, "player", next.idMap);
      if ("error" in player) {
        errors.push({ row: row.rowNumber, message: player.error });
        continue;
      }
      const pts = num(row.values, "pts_per_100");
      const ptsGames = int(row.values, "pts_per_100_games");
      const usg = num(row.values, "usg_pct");
      const usgGames = int(row.values, "usg_games");
      let reb = num(row.values, "reb_per_minute");
      const rebGames = int(row.values, "reb_per_minute_games");
      const recentPts = num(row.values, "recent_points_per_game");
      const recentReb = num(row.values, "recent_rebounds_per_game");
      const recentGames = int(row.values, "recent_games");
      const trbPer36 = num(row.values, "trb_per_36");
      const recentRebMin = num(row.values, "recent_reb_per_minute");
      const stamped = timestamp(row.values);
      const bad = parsedError([pts, ptsGames, usg, usgGames, reb, rebGames, recentPts, recentReb, recentGames, trbPer36, recentRebMin, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      let rebPerMinute = val(reb);
      let rebSample = val(rebGames);
      const per36 = val(trbPer36);
      const recentMinute = val(recentRebMin);
      if (rebPerMinute == null && per36 != null && recentMinute != null) {
        rebPerMinute = blendedReboundsPerMinute(per36, recentMinute);
        if (rebSample == null) rebSample = val(recentGames);
      } else if (rebPerMinute == null && (per36 != null || recentMinute != null)) {
        warnings.push(`Row ${row.rowNumber}: rebounds per minute needs both trb_per_36 and recent_reb_per_minute, so neither component was used alone.`);
      }
      const previous = next.rates.find((rate) => idsEqual(rate.playerId, player.id));
      const usgValue = val(usg);
      const usgSample = val(usgGames);
      incoming.push({
        playerId: player.id,
        season: CURRENT_SEASON,
        ptsPer100: val(pts),
        ptsPer100Games: val(ptsGames),
        usgPct: usgValue ?? previous?.usgPct ?? null,
        usgGames: usgSample ?? previous?.usgGames ?? null,
        rebPerMinute,
        rebPerMinuteGames: rebSample,
        recentPointsPerGame: val(recentPts),
        recentReboundsPerGame: val(recentReb),
        recentGames: val(recentGames),
        sourceTimestamp: val(stamped),
      });
    }
    next.rates = take(next.rates, incoming, (r) => r.playerId);
  } else if (kind === "dvp") {
    const incoming: Dvp[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const team = resolveId(row.values, "team", next.idMap);
      if ("error" in team) {
        errors.push({ row: row.rowNumber, message: team.error });
        continue;
      }
      const position = (row.values.position ?? "").trim().toUpperCase();
      if (!isPosition(position)) {
        errors.push({ row: row.rowNumber, message: "position must be PG, SG, SF, PF, or C." });
        continue;
      }
      let pointsDiff = num(row.values, "points_diff");
      let reboundsDiff = num(row.values, "rebounds_diff");
      const p30 = num(row.values, "points_diff_l30");
      const p15 = num(row.values, "points_diff_l15");
      const r30 = num(row.values, "rebounds_diff_l30");
      const r15 = num(row.values, "rebounds_diff_l15");
      const stamped = timestamp(row.values);
      const bad = parsedError([pointsDiff, reboundsDiff, p30, p15, r30, r15, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      const p30v = val(p30);
      const p15v = val(p15);
      const r30v = val(r30);
      const r15v = val(r15);
      if (val(pointsDiff) == null && p30v != null && p15v != null) pointsDiff = { value: weightedDvp(p30v, p15v) };
      if (val(reboundsDiff) == null && r30v != null && r15v != null) reboundsDiff = { value: weightedDvp(r30v, r15v) };
      incoming.push({
        teamId: team.id,
        position,
        season: CURRENT_SEASON,
        pointsDiff: val(pointsDiff),
        reboundsDiff: val(reboundsDiff),
        sourceTimestamp: val(stamped),
      });
    }
    next.dvp = take(next.dvp, incoming, (r) => `${r.teamId}|${r.position}`);
  } else if (kind === "pace") {
    const incoming: PaceRow[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const team = resolveId(row.values, "team", next.idMap);
      if ("error" in team) {
        errors.push({ row: row.rowNumber, message: team.error });
        continue;
      }
      let pace = num(row.values, "pace");
      let paceDiff = num(row.values, "pace_diff");
      const l10 = num(row.values, "pace_l10");
      const szn = num(row.values, "pace_season");
      const leagueL10 = num(row.values, "league_pace_l10");
      const leagueSzn = num(row.values, "league_pace_season");
      const stamped = timestamp(row.values);
      const bad = parsedError([pace, paceDiff, l10, szn, leagueL10, leagueSzn, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      const l10v = val(l10);
      const sznV = val(szn);
      const leagueL10v = val(leagueL10);
      const leagueSznV = val(leagueSzn);
      if (val(pace) == null && l10v != null && sznV != null) pace = { value: weightedPace(l10v, sznV) };
      if (val(paceDiff) == null && l10v != null && sznV != null && leagueL10v != null && leagueSznV != null) {
        paceDiff = { value: weightedPaceDiff(l10v, leagueL10v, sznV, leagueSznV) };
      }
      incoming.push({
        teamId: team.id,
        season: CURRENT_SEASON,
        pace: val(pace),
        paceDiff: val(paceDiff),
        sourceTimestamp: val(stamped),
      });
    }
    next.pace = take(next.pace, incoming, (r) => r.teamId);
  } else if (kind === "opp_rebounds") {
    const incoming: OppRebound[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const team = resolveId(row.values, "team", next.idMap);
      if ("error" in team) {
        errors.push({ row: row.rowNumber, message: team.error });
        continue;
      }
      let diff = num(row.values, "rebound_diff");
      const seasonRpg = num(row.values, "opp_rpg_season");
      const last3 = num(row.values, "opp_rpg_l3");
      const league = num(row.values, "league_blend_avg");
      const stamped = timestamp(row.values);
      const bad = parsedError([diff, seasonRpg, last3, league, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      const seasonRpgV = val(seasonRpg);
      const last3v = val(last3);
      const leagueV = val(league);
      if (val(diff) == null && seasonRpgV != null && last3v != null && leagueV != null) {
        diff = { value: weightedOppReboundDiff(seasonRpgV, last3v, leagueV) };
      }
      incoming.push({ teamId: team.id, season: CURRENT_SEASON, reboundDiff: val(diff), sourceTimestamp: val(stamped) });
    }
    next.oppRebounds = take(next.oppRebounds, incoming, (r) => r.teamId);
  } else if (kind === "vegas") {
    const incoming: Vegas[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const game = resolveId(row.values, "game", next.idMap);
      const team = resolveId(row.values, "team", next.idMap);
      if ("error" in game || "error" in team) {
        errors.push({ row: row.rowNumber, message: "error" in game ? game.error : (team as { error: string }).error });
        continue;
      }
      const spread = requireNum(row.values, "spread");
      const total = requireNum(row.values, "total");
      const stamped = timestamp(row.values);
      const bad = parsedError([spread, total, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      if (val(total) <= 0) {
        errors.push({ row: row.rowNumber, message: "total must be positive." });
        continue;
      }
      incoming.push({
        gameId: game.id,
        teamId: team.id,
        season: CURRENT_SEASON,
        spread: val(spread),
        total: val(total),
        sourceTimestamp: val(stamped),
      });
    }
    next.vegas = take(next.vegas, incoming, (r) => `${r.gameId}|${r.teamId}`);
  } else if (kind === "actuals") {
    const incoming: Actual[] = [];
    for (const row of rows) {
      const season = seasonError(row.values);
      if (season) {
        errors.push({ row: row.rowNumber, message: season });
        continue;
      }
      const player = resolveId(row.values, "player", next.idMap);
      const game = resolveId(row.values, "game", next.idMap);
      if ("error" in player || "error" in game) {
        errors.push({ row: row.rowNumber, message: "error" in player ? player.error : (game as { error: string }).error });
        continue;
      }
      const dnpRaw = (row.values.dnp ?? "").trim().toLowerCase();
      let dnp = false;
      if (dnpRaw === "") dnp = false;
      else if (["true", "yes", "y", "1", "dnp"].includes(dnpRaw)) dnp = true;
      else if (["false", "no", "n", "0"].includes(dnpRaw)) dnp = false;
      else {
        errors.push({ row: row.rowNumber, message: "dnp must be true or false." });
        continue;
      }
      const points = num(row.values, "points");
      const rebounds = num(row.values, "rebounds");
      const stamped = timestamp(row.values);
      const bad = parsedError([points, rebounds, stamped]);
      if (bad) {
        errors.push({ row: row.rowNumber, message: bad });
        continue;
      }
      if (dnp && (val(points) != null || val(rebounds) != null)) {
        errors.push({ row: row.rowNumber, message: "DNP rows cannot include points or rebounds. No void rule was assumed." });
        continue;
      }
      incoming.push({
        playerId: player.id,
        gameId: game.id,
        season: CURRENT_SEASON,
        dnp,
        points: dnp ? null : val(points),
        rebounds: dnp ? null : val(rebounds),
        sourceTimestamp: val(stamped),
      });
    }
    next.actuals = take(next.actuals, incoming, (r) => `${r.playerId}|${r.gameId}`);
  }

  return {
    kind,
    inserted,
    updated,
    rejected: errors.length,
    warnings,
    errors,
    db: next,
  };
}

export function importBundle(
  db: Database,
  sections: Partial<Record<ImportKind, { rowNumber: number; values: Raw }[]>>,
): { db: Database; results: ImportResult[] } {
  const order: ImportKind[] = [
    "id_map",
    "teams",
    "players",
    "games",
    "projections",
    "lines",
    "player_rates",
    "dvp",
    "pace",
    "opp_rebounds",
    "vegas",
    "actuals",
  ];
  const results: ImportResult[] = [];
  let current = db;
  for (const kind of order) {
    const rows = sections[kind];
    if (!rows) continue;
    const result = importRecords(current, kind, rows);
    current = result.db;
    results.push(result);
  }
  return { db: current, results };
}

export function updateSettings(db: Database, patch: Settings): { db: Database; error?: string } {
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
  const next = { ...db.settings };
  for (const key of keys) {
    const value = patch[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return { db, error: `${key} must be a number.` };
    if (key === "minRecentGames" || key === "minRateGames") {
      if (!Number.isInteger(value) || value < 1) return { db, error: `${key} must be a whole number of at least 1.` };
    } else if (value <= 0) {
      return { db, error: `${key} must be greater than 0. Use a large strength such as 10000 to turn an adjustment off.` };
    }
    next[key] = value;
  }
  return { db: { ...db, settings: next } };
}

function locked(db: Database, playerId: string, gameId: string): boolean {
  return db.actuals.some((row) => idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId));
}

export function setMinutesOverride(
  db: Database,
  playerId: string,
  gameId: string,
  minutes: number | null,
): { db: Database; error?: string } {
  if (!db.players.some((p) => idsEqual(p.playerId, playerId))) return { db, error: "Unknown player id." };
  if (!db.games.some((g) => idsEqual(g.gameId, gameId))) return { db, error: "Unknown game id." };
  if (locked(db, playerId, gameId)) {
    return { db, error: "Actuals are already stored for this player and game. The minutes override was not changed." };
  }
  if (minutes == null) {
    return { db: { ...db, overrides: db.overrides.filter((o) => !(idsEqual(o.playerId, playerId) && idsEqual(o.gameId, gameId))) } };
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 48) return { db, error: "Minutes must be between 0 and 48." };
  const result = upsertByKey(db.overrides, [{ playerId, gameId, minutes }], (o) => `${o.playerId}|${o.gameId}`);
  return { db: { ...db, overrides: result.rows } };
}

export function setPropLine(
  db: Database,
  playerId: string,
  gameId: string,
  stat: Stat,
  line: number | null,
  savedAt: string,
): { db: Database; error?: string; stored?: boolean; reason?: string } {
  if (!db.players.some((p) => idsEqual(p.playerId, playerId))) return { db, error: "Unknown player id." };
  if (!db.games.some((g) => idsEqual(g.gameId, gameId))) return { db, error: "Unknown game id." };
  if (!STATS.includes(stat)) return { db, error: "Unknown stat." };
  if (locked(db, playerId, gameId)) return { db, error: "Results are already stored. The line was not changed." };
  const same = (row: PropLine) => idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId) && row.stat === stat;
  if (line == null) {
    const cleared = {
      ...db,
      lines: db.lines.filter((row) => !same(row)),
      pregame: db.pregame.filter((row) => !(idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId) && row.stat === stat)),
    };
    return { db: cleared, stored: false };
  }
  if (!Number.isFinite(line) || line <= 0) return { db, error: "The line must be a positive number." };
  const prior = db.lines.find(same);
  const row: PropLine = {
    playerId,
    gameId,
    stat,
    season: CURRENT_SEASON,
    line,
    overOdds: prior?.overOdds ?? null,
    underOdds: prior?.underOdds ?? null,
    source: "manual",
    sourceTimestamp: savedAt,
  };
  const withLine = { ...db, lines: upsertByKey(db.lines, [row], (item) => `${item.playerId}|${item.gameId}|${item.stat}`).rows };
  return rememberPregame(withLine, playerId, gameId, stat, savedAt);
}

type Eval = {
  points: StatProjection;
  rebounds: StatProjection;
  combined: StatProjection;
  minutesImported: number | null;
  minutesUsed: number | null;
  impliedTeamPoints: number | null;
  impliedDetail: string | null;
  stamps: { label: string; timestamp: string | null }[];
};

function current<T extends { season: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.season === CURRENT_SEASON);
}

function evaluatePlayer(db: Database, player: Player, game: Game): Eval {
  const opponentId = game.homeTeamId === player.teamId ? game.awayTeamId : game.homeTeamId;
  const projections = current(db.projections).filter((p) => idsEqual(p.playerId, player.playerId) && idsEqual(p.gameId, game.gameId));
  const ignoredPrior = db.projections.some((p) => idsEqual(p.playerId, player.playerId) && idsEqual(p.gameId, game.gameId) && p.season !== CURRENT_SEASON);
  const rate = current(db.rates).find((r) => idsEqual(r.playerId, player.playerId)) ?? null;
  const priorRate = db.rates.find((r) => idsEqual(r.playerId, player.playerId) && r.season !== CURRENT_SEASON);
  const dvp = current(db.dvp).find((d) => idsEqual(d.teamId, opponentId) && d.position === player.position) ?? null;
  const teamPace = current(db.pace).find((p) => idsEqual(p.teamId, player.teamId)) ?? null;
  const oppPace = current(db.pace).find((p) => idsEqual(p.teamId, opponentId)) ?? null;
  const oppReb = current(db.oppRebounds).find((o) => idsEqual(o.teamId, opponentId)) ?? null;
  const vegas = current(db.vegas).find((v) => idsEqual(v.gameId, game.gameId) && idsEqual(v.teamId, player.teamId)) ?? null;
  const minuteValues = projections.map((p) => p.minutes).filter((m): m is number => m != null);
  const minutesImported = average(minuteValues);
  const minutesUsed = minutesImported;
  const pointsLine = lineFor(db, player.playerId, game.gameId, "points");
  const teamPoints = vegas ? favoredTeamPoints(vegas.total, vegas.spread) : null;

  const sharedFlags: string[] = [];
  if (ignoredPrior || priorRate) sharedFlags.push("A prior-season input was present and was not used.");
  if (rate == null && !priorRate) sharedFlags.push("No 2026–27 rate row for this player. Rate adjustments will be skipped.");

  const points = projectPoints({
    sources: projections.map((p) => ({ source: p.source, value: p.points })),
    projectedMinutes: minutesUsed,
    ptsPer100: rate?.ptsPer100 ?? null,
    ptsPer100Games: rate?.ptsPer100Games ?? null,
    usgPct: rate?.usgPct ?? null,
    usgGames: rate?.usgGames ?? null,
    recentPerGame: rate?.recentPointsPerGame ?? null,
    recentGames: rate?.recentGames ?? null,
    dvpDiff: dvp?.pointsDiff ?? null,
    dvpNote: dvpWindowNote(dvp?.pointsWindow),
    paceDiff: oppPace?.paceDiff ?? null,
    gamePace: null,
    gamePacePartial: false,
    teamPoints,
    line: pointsLine?.line ?? null,
    strengths: db.settings,
  });
  const rebounds = projectRebounds({
    sources: projections.map((p) => ({ source: p.source, value: p.rebounds })),
    projectedMinutes: minutesUsed,
    rebPerMinute: rate?.rebPerMinute ?? null,
    rebPerMinuteGames: rate?.rebPerMinuteGames ?? null,
    recentPerGame: rate?.recentReboundsPerGame ?? null,
    recentGames: rate?.recentGames ?? null,
    dvpDiff: dvp?.reboundsDiff ?? null,
    dvpNote: dvpWindowNote(dvp?.reboundsWindow),
    paceDiff: oppPace?.paceDiff ?? null,
    oppReboundDiff: oppReb?.reboundDiff ?? null,
    strengths: db.settings,
  });
  points.flags.push(...sharedFlags);
  rebounds.flags.push(...sharedFlags);
  const combined = projectPointsPlusRebounds(points, rebounds);

  let implied: number | null = null;
  let impliedDetail: string | null = null;
  if (vegas) {
    implied = impliedTeamPoints(vegas.total, vegas.spread);
    const favored = favoredTeamPoints(vegas.total, vegas.spread);
    impliedDetail = `(${vegas.total} total − ${vegas.spread} signed spread) / 2 = ${roundDetail(implied)}. The minutes weight uses ${roundDetail(favored)}: half the total, plus the spread when this team is favored and minus it when not.`;
  }

  const lineStamps = current(db.lines)
    .filter((line) => idsEqual(line.playerId, player.playerId) && idsEqual(line.gameId, game.gameId))
    .map((line) => ({ label: `${line.stat} line`, timestamp: line.sourceTimestamp }));
  const stamps = [
    ...projections.map((p) => ({ label: `${p.source} projection`, timestamp: p.sourceTimestamp })),
    ...(rate ? [{ label: "player rates", timestamp: rate.sourceTimestamp }] : []),
    ...(dvp ? [{ label: "defense vs position", timestamp: dvp.sourceTimestamp }] : []),
    ...(teamPace ? [{ label: "team pace", timestamp: teamPace.sourceTimestamp }] : []),
    ...(oppPace ? [{ label: "opponent pace", timestamp: oppPace.sourceTimestamp }] : []),
    ...(oppReb ? [{ label: "opponent rebounds", timestamp: oppReb.sourceTimestamp }] : []),
    ...(vegas ? [{ label: "vegas", timestamp: vegas.sourceTimestamp }] : []),
    ...lineStamps,
  ];

  return { points, rebounds, combined, minutesImported, minutesUsed, impliedTeamPoints: implied, impliedDetail, stamps };
}

function withFreshness(projection: StatProjection, stamps: Eval["stamps"], slateDate: string, relevant: boolean): StatProjection {
  if (!relevant) return projection;
  const flags = projection.flags.slice();
  for (const stamp of stamps) {
    const flag = freshnessFlag(stamp.label, stamp.timestamp, slateDate);
    if (flag && !flags.includes(flag)) flags.push(flag);
  }
  return { ...projection, flags };
}

export type ModelMessage = { level: "error" | "info"; playerId: string | null; message: string };

function playerGames(db: Database, date: string): { player: Player; game: Game }[] {
  const games = db.games.filter((g) => g.gameDate === date && g.season === CURRENT_SEASON);
  const pairs: { player: Player; game: Game }[] = [];
  for (const game of games) {
    for (const player of db.players) {
      if (player.season !== CURRENT_SEASON) continue;
      if (player.teamId === game.homeTeamId || player.teamId === game.awayTeamId) pairs.push({ player, game });
    }
  }
  return pairs;
}

function lineFor(db: Database, playerId: string, gameId: string, stat: Stat): PropLine | null {
  return current(db.lines).find((l) => idsEqual(l.playerId, playerId) && idsEqual(l.gameId, gameId) && l.stat === stat) ?? null;
}

function rememberPregame(
  db: Database,
  playerId: string,
  gameId: string,
  stat: Stat,
  savedAt: string,
): { db: Database; stored: boolean; reason?: string } {
  const player = db.players.find((item) => idsEqual(item.playerId, playerId));
  const game = db.games.find((item) => idsEqual(item.gameId, gameId));
  const drop = db.pregame.filter((row) => !(idsEqual(row.playerId, playerId) && idsEqual(row.gameId, gameId) && row.stat === stat));
  if (!player || !game) return { db, stored: false, reason: "Unknown player or game." };
  const line = lineFor(db, playerId, gameId, stat);
  if (!line) return { db: { ...db, pregame: drop }, stored: false };
  const evaled = evaluatePlayer(db, player, game);
  const raw = stat === "points" ? evaled.points : stat === "rebounds" ? evaled.rebounds : evaled.combined;
  const projection = withFreshness(raw, evaled.stamps, game.gameDate, raw.status === "ok");
  if (projection.status !== "ok" || projection.projection == null) {
    return { db, stored: false, reason: projection.blockReason ?? "No projection." };
  }
  const row = toPregame(playerId, gameId, game.gameDate, stat, projection, line, savedAt);
  return { db: { ...db, pregame: upsertByKey(drop, [row], (item) => `${item.playerId}|${item.gameId}|${item.stat}`).rows }, stored: true };
}

function toPregame(playerId: string, gameId: string, date: string, stat: Stat, projection: StatProjection, line: PropLine | null, savedAt: string): PregameStat {
  return {
    playerId,
    gameId,
    stat,
    slateDate: date,
    baseline: projection.baseline,
    projection: projection.projection,
    minutes: projection.minutes,
    adjustments: projection.adjustments,
    flags: projection.flags,
    line: line?.line ?? null,
    overOdds: line?.overOdds ?? null,
    underOdds: line?.underOdds ?? null,
    savedAt,
    sourcesUsed: projection.sourcesUsed,
  };
}

export function applyModelRun(db: Database, date: string, savedAt: string): { db: Database; messages: ModelMessage[] } {
  const pairs = playerGames(db, date);
  const messages: ModelMessage[] = [];
  if (pairs.length === 0) {
    return { db, messages: [{ level: "error", playerId: null, message: `No 2026–27 games on ${date}.` }] };
  }
  let pregame = db.pregame.slice();
  let saved = 0;
  let kept = 0;
  let blocked = 0;
  let unlined = 0;
  for (const { player, game } of pairs) {
    const isLocked = locked(db, player.playerId, game.gameId);
    if (isLocked) {
      kept++;
      messages.push({
        level: "info",
        playerId: player.playerId,
        message: `${player.displayName}: actuals are stored. The saved pregame projection, line, odds, and timestamp were not changed.`,
      });
      continue;
    }
    const evaled = evaluatePlayer(db, player, game);
    const stamped = {
      points: withFreshness(evaled.points, evaled.stamps, date, evaled.points.status === "ok"),
      rebounds: withFreshness(evaled.rebounds, evaled.stamps, date, evaled.rebounds.status === "ok"),
      combined: withFreshness(evaled.combined, evaled.stamps, date, evaled.combined.status === "ok"),
    };
    const produced: PregameStat[] = [];
    for (const stat of STATS) {
      const projection = stat === "points" ? stamped.points : stat === "rebounds" ? stamped.rebounds : stamped.combined;
      const line = lineFor(db, player.playerId, game.gameId, stat);
      if (!line) {
        unlined++;
        pregame = pregame.filter((row) => !(idsEqual(row.playerId, player.playerId) && idsEqual(row.gameId, game.gameId) && row.stat === stat));
        continue;
      }
      if (projection.status !== "ok" || projection.projection == null) {
        blocked++;
        const existing = pregame.find((p) => idsEqual(p.playerId, player.playerId) && idsEqual(p.gameId, game.gameId) && p.stat === stat);
        messages.push({
          level: "error",
          playerId: player.playerId,
          message: `${player.displayName} ${statLabel(stat)}: ${projection.blockReason}${existing ? " Previous saved projection kept." : ""}`,
        });
        continue;
      }
      produced.push(toPregame(player.playerId, game.gameId, date, stat, projection, line, savedAt));
    }
    if (produced.length) {
      const merged = upsertByKey(pregame, produced, (p) => `${p.playerId}|${p.gameId}|${p.stat}`);
      pregame = merged.rows;
      saved += produced.length;
    }
  }
  messages.unshift({
    level: "info",
    playerId: null,
    message: `Saved ${saved} pregame stat rows. ${unlined} had no line and were left out of History. ${blocked} blocked. ${kept} player-games left locked.`,
  });
  return { db: { ...db, pregame }, messages };
}

export type SlateStat = {
  source: "saved" | "preview" | "unavailable";
  savedAt: string | null;
  savedProjection: number | null;
  baseline: number | null;
  projection: number | null;
  adjustments: Adjustment[];
  flags: string[];
  blockReason: string | null;
  line: number | null;
  overOdds: number | null;
  underOdds: number | null;
  edge: number | null;
  pick: PickSide | null;
  actual: number | null;
  error: number | null;
  grade: Grade;
  sourcesUsed: string[];
};

export type SlateRow = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  opponentId: string;
  opponentName: string;
  gameId: string;
  gameLabel: string;
  position: Position;
  gameStatus: GameStatus;
  locked: boolean;
  minutesImported: number | null;
  minutesOverride: number | null;
  minutesUsed: number | null;
  impliedTeamPoints: number | null;
  impliedDetail: string | null;
  stats: Record<Stat, SlateStat>;
};

export type SlateGame = {
  gameId: string;
  label: string;
  status: GameStatus;
  homeTeamId: string;
  awayTeamId: string;
  spread: number | null;
  total: number | null;
  tipAt: string | null;
  tipLabel: string | null;
};

export type SlateView = {
  date: string;
  dates: string[];
  settings: Settings;
  teams: Team[];
  games: SlateGame[];
  rows: SlateRow[];
  summaries: Record<Stat, Summary>;
  research: Finding[];
};

function statLabel(stat: Stat): string {
  if (stat === "points") return "points";
  if (stat === "rebounds") return "rebounds";
  return "points + rebounds";
}

function actualValue(actual: Actual | null, stat: Stat): number | null {
  if (!actual || actual.dnp) return null;
  if (stat === "points") return actual.points;
  if (stat === "rebounds") return actual.rebounds;
  if (actual.points == null || actual.rebounds == null) return null;
  return actual.points + actual.rebounds;
}

function viewStat(
  stat: Stat,
  live: StatProjection,
  saved: PregameStat | undefined,
  line: PropLine | null,
  actual: Actual | null,
  game: Game,
  isLocked: boolean,
): SlateStat {
  const actualNumber = actualValue(actual, stat);
  const graded = gradeResult({
    projection: saved?.projection ?? null,
    line: saved?.line ?? null,
    actual: actualNumber,
    dnp: actual?.dnp ?? false,
    gameFinal: game.status === "final",
  });
  if (isLocked && !saved) {
    return {
      source: "unavailable",
      savedAt: null,
      savedProjection: null,
      baseline: null,
      projection: null,
      adjustments: [],
      flags: ["No pregame projection was saved before results. A postgame projection was not calculated."],
      blockReason: "No saved pregame projection.",
      line: null,
      overOdds: null,
      underOdds: null,
      edge: null,
      pick: null,
      actual: actualNumber,
      error: null,
      grade: graded.grade,
      sourcesUsed: [],
    };
  }
  if (isLocked && saved) {
    const edge = edgeAndPick(saved.projection, saved.line);
    return {
      source: "saved",
      savedAt: saved.savedAt,
      savedProjection: saved.projection,
      baseline: saved.baseline,
      projection: saved.projection,
      adjustments: saved.adjustments,
      flags: saved.flags,
      blockReason: null,
      line: saved.line,
      overOdds: saved.overOdds,
      underOdds: saved.underOdds,
      edge: edge.edge,
      pick: edge.pick,
      actual: actualNumber,
      error: graded.error,
      grade: graded.grade,
      sourcesUsed: saved.sourcesUsed,
    };
  }
  const shownLine = line?.line ?? null;
  const stored = saved != null && saved.line != null && shownLine != null;
  const edge = edgeAndPick(live.projection, shownLine);
  return {
    source: stored ? "saved" : "preview",
    savedAt: stored ? saved?.savedAt ?? null : null,
    savedProjection: stored ? saved?.projection ?? null : null,
    baseline: live.baseline,
    projection: live.projection,
    adjustments: live.adjustments,
    flags: live.flags,
    blockReason: live.blockReason,
    line: shownLine,
    overOdds: line?.overOdds ?? null,
    underOdds: line?.underOdds ?? null,
    edge: edge.edge,
    pick: edge.pick,
    actual: actualNumber,
    error: graded.error,
    grade: graded.grade,
    sourcesUsed: live.sourcesUsed,
  };
}

function preferFirst<T>(current: T): T {
  return current;
}

export function canonicalizeDatabase(db: Database): Database {
  const teamOf = (id: string) => canonicalTeam(id) ?? id;
  const gameIdOf = new Map<string, string>();
  const games: Game[] = [];
  for (const game of db.games) {
    const homeTeamId = teamOf(game.homeTeamId);
    const awayTeamId = teamOf(game.awayTeamId);
    const gameId = game.gameId.includes("@") ? matchupGameId(game.gameDate, awayTeamId, homeTeamId) : game.gameId;
    gameIdOf.set(game.gameId, gameId);
    const next = { ...game, gameId, homeTeamId, awayTeamId };
    const at = games.findIndex((row) => row.gameId === gameId);
    if (at < 0) games.push(next);
    else {
      const statusRank = { scheduled: 0, in_progress: 1, final: 2 };
      const status = statusRank[games[at].status] >= statusRank[next.status] ? games[at].status : next.status;
      const tipAt = games[at].tipAt ?? next.tipAt ?? null;
      games[at] = { ...games[at], status, tipAt };
    }
  }
  const gameOf = (gameId: string) => gameIdOf.get(gameId) ?? gameId;
  const teams = dedupe(db.teams.map((row) => ({ ...row, teamId: teamOf(row.teamId) })), (row) => row.teamId, (current, incoming) =>
    current.name !== current.teamId ? current : incoming.name !== incoming.teamId ? incoming : current,
  );
  return {
    ...db,
    teams,
    players: dedupe(db.players.map((row) => ({ ...row, teamId: teamOf(row.teamId) })), (row) => row.playerId, preferFirst),
    games,
    idMap: db.idMap.map((row) => row.entityType === "team" ? { ...row, canonicalId: teamOf(row.canonicalId) } : row),
    projections: dedupe(
      db.projections.map((row) => ({ ...row, gameId: gameOf(row.gameId) })),
      (row) => `${row.playerId}|${row.gameId}|${row.source}`,
      (current, incoming) => current.points != null || current.rebounds != null ? current : incoming,
    ),
    lines: dedupe(
      db.lines.map((row) => ({ ...row, gameId: gameOf(row.gameId) })),
      (row) => `${row.playerId}|${row.gameId}|${row.stat}`,
      (current, incoming) => current.source === "manual" ? current : incoming.source === "manual" ? incoming : current,
    ),
    dvp: dedupe(db.dvp.map((row) => ({ ...row, teamId: teamOf(row.teamId) })), (row) => `${row.teamId}|${row.position}`, (current, incoming) =>
      current.pointsDiff != null || current.reboundsDiff != null ? current : incoming,
    ),
    pace: dedupe(db.pace.map((row) => ({ ...row, teamId: teamOf(row.teamId) })), (row) => row.teamId, (current, incoming) =>
      current.pace != null ? current : incoming,
    ),
    oppRebounds: dedupe(db.oppRebounds.map((row) => ({ ...row, teamId: teamOf(row.teamId) })), (row) => row.teamId, (current, incoming) =>
      current.reboundDiff != null ? current : incoming,
    ),
    vegas: dedupe(
      db.vegas.map((row) => ({ ...row, gameId: gameOf(row.gameId), teamId: teamOf(row.teamId) })),
      (row) => `${row.gameId}|${row.teamId}`,
      preferFirst,
    ),
    overrides: dedupe(
      db.overrides.map((row) => ({ ...row, gameId: gameOf(row.gameId) })),
      (row) => `${row.playerId}|${row.gameId}`,
      preferFirst,
    ),
    pregame: dedupe(
      db.pregame.map((row) => ({ ...row, gameId: gameOf(row.gameId) })),
      (row) => `${row.playerId}|${row.gameId}|${row.stat}`,
      (current, incoming) => current.line != null ? current : incoming,
    ),
    actuals: dedupe(
      db.actuals.map((row) => ({ ...row, gameId: gameOf(row.gameId) })),
      (row) => `${row.playerId}|${row.gameId}`,
      (current, incoming) => current.points != null || current.rebounds != null ? current : incoming,
    ),
    research: db.research.map((row) => ({ ...row, teamId: row.teamId ? teamOf(row.teamId) : row.teamId })),
  };
}

function dedupe<T>(rows: T[], keyFn: (row: T) => string, prefer: (current: T, incoming: T) => T): T[] {
  const kept = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    const current = kept.get(key);
    kept.set(key, current ? prefer(current, row) : row);
  }
  return [...kept.values()];
}

export function buildSlate(db: Database, date: string): SlateView {
  db = canonicalizeDatabase(db);
  const teamName = (id: string) => db.teams.find((t) => idsEqual(t.teamId, id))?.name ?? id;
  const rows: SlateRow[] = [];
  for (const { player, game } of playerGames(db, date)) {
    const opponentId = game.homeTeamId === player.teamId ? game.awayTeamId : game.homeTeamId;
    const evaled = evaluatePlayer(db, player, game);
    const live = {
      points: withFreshness(evaled.points, evaled.stamps, date, true),
      rebounds: withFreshness(evaled.rebounds, evaled.stamps, date, true),
      combined: withFreshness(evaled.combined, evaled.stamps, date, true),
    };
    const isLocked = locked(db, player.playerId, game.gameId);
    const override = db.overrides.find((o) => idsEqual(o.playerId, player.playerId) && idsEqual(o.gameId, game.gameId));
    const actual = db.actuals.find((a) => idsEqual(a.playerId, player.playerId) && idsEqual(a.gameId, game.gameId)) ?? null;
    const stats = {} as Record<Stat, SlateStat>;
    let savedMinutes: number | null = null;
    for (const stat of STATS) {
      const projection = stat === "points" ? live.points : stat === "rebounds" ? live.rebounds : live.combined;
      const saved = db.pregame.find((p) => idsEqual(p.playerId, player.playerId) && idsEqual(p.gameId, game.gameId) && p.stat === stat);
      if (stat === "points" && saved?.minutes != null) savedMinutes = saved.minutes;
      stats[stat] = viewStat(stat, projection, saved, lineFor(db, player.playerId, game.gameId, stat), actual, game, isLocked);
    }
    const homeAway = player.teamId === game.homeTeamId ? "vs" : "at";
    rows.push({
      playerId: player.playerId,
      playerName: player.displayName,
      teamId: player.teamId,
      teamName: teamName(player.teamId),
      opponentId,
      opponentName: teamName(opponentId),
      gameId: game.gameId,
      gameLabel: `${player.teamId} ${homeAway} ${opponentId}`,
      position: player.position,
      gameStatus: game.status,
      locked: isLocked,
      minutesImported: evaled.minutesImported,
      minutesOverride: override?.minutes ?? null,
      minutesUsed: isLocked && savedMinutes != null ? savedMinutes : evaled.minutesUsed,
      impliedTeamPoints: evaled.impliedTeamPoints,
      impliedDetail: evaled.impliedDetail,
      stats,
    });
  }
  rows.sort((a, b) => a.gameLabel.localeCompare(b.gameLabel) || a.playerName.localeCompare(b.playerName));
  const summaries = {} as Record<Stat, Summary>;
  for (const stat of STATS) {
    summaries[stat] = summarize(rows.map((row) => ({ grade: row.stats[stat].grade, error: row.stats[stat].error })));
  }
  const games: SlateGame[] = db.games
    .filter((g) => g.gameDate === date && g.season === CURRENT_SEASON)
    .map((g) => {
      const home = current(db.vegas).find((v) => idsEqual(v.gameId, g.gameId) && idsEqual(v.teamId, g.homeTeamId));
      const any = current(db.vegas).find((v) => idsEqual(v.gameId, g.gameId));
      const tipAt = g.tipAt ?? null;
      return {
        gameId: g.gameId,
        label: `${g.awayTeamId} at ${g.homeTeamId}`,
        status: g.status,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        spread: home?.spread ?? null,
        total: home?.total ?? any?.total ?? null,
        tipAt,
        tipLabel: tipLabel(tipAt),
      };
    })
    .sort(byTipThenLabel);
  const dates = [...new Set(db.games.filter((g) => g.season === CURRENT_SEASON).map((g) => g.gameDate))].sort((a, b) => b.localeCompare(a));
  return {
    date,
    dates,
    settings: db.settings,
    teams: db.teams.slice().sort((a, b) => a.teamId.localeCompare(b.teamId)),
    games,
    rows,
    summaries,
    research: db.research.filter((f) => f.slateDate === date),
  };
}

const AVAILABILITY = new Set(["out", "questionable", "available", "minutes_restriction"]);

export function normalizeFindings(
  payload: unknown,
  ctx: { slateDate: string; retrievedAt: string; playerIds: Set<string>; teamIds: Set<string> },
): { findings: Finding[]; discarded: string[] } {
  const discarded: string[] = [];
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { findings?: unknown }).findings)
      ? (payload as { findings: unknown[] }).findings
      : null;
  if (!list) return { findings: [], discarded: ["The provider response was not a list of findings. Nothing was invented."] };
  const findings: Finding[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") {
      discarded.push("A finding was not an object and was dropped.");
      continue;
    }
    const raw = item as Record<string, unknown>;
    const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
    if (!summary) {
      discarded.push("A finding without a summary was dropped.");
      continue;
    }
    const mentionsOther = /20(1\d|2[0-5])-\d{2}/.test(summary);
    const mentionsCurrent = summary.includes(CURRENT_SEASON);
    if (mentionsOther && !mentionsCurrent) {
      discarded.push("A finding about a different season was dropped.");
      continue;
    }
    let playerId = typeof raw.player_id === "string" ? raw.player_id.trim() : "";
    let teamId = typeof raw.team_id === "string" ? raw.team_id.trim() : "";
    const flags: string[] = [];
    if (playerId && !ctx.playerIds.has(playerId)) {
      flags.push("Returned player id was not on the slate and was not name-matched.");
      playerId = "";
    }
    if (teamId && !ctx.teamIds.has(teamId)) {
      flags.push("Returned team id was not on the slate and was not name-matched.");
      teamId = "";
    }
    let sourceUrl: string | null = null;
    if (typeof raw.source_url === "string" && /^https?:\/\//i.test(raw.source_url.trim())) {
      sourceUrl = raw.source_url.trim().slice(0, 500);
    }
    let kind: Finding["kind"] = raw.kind === "verified" ? "verified" : "inference";
    if (kind === "verified" && !sourceUrl) {
      kind = "inference";
      flags.push("Verified was removed because there is no source URL.");
    }
    if (!sourceUrl) flags.push("Missing source URL.");
    const availability = typeof raw.availability === "string" && AVAILABILITY.has(raw.availability) ? raw.availability : null;
    const suggestedMinutes = typeof raw.suggested_minutes === "number" && Number.isFinite(raw.suggested_minutes)
      ? raw.suggested_minutes
      : null;
    const suggestedRole = typeof raw.suggested_role === "string" ? raw.suggested_role.trim().slice(0, 120) : null;
    let publishedAt: string | null = null;
    if (typeof raw.published_at === "string" && raw.published_at.trim()) {
      const date = new Date(raw.published_at);
      publishedAt = Number.isNaN(date.getTime()) ? null : date.toISOString();
      if (!publishedAt) flags.push("Publication time could not be read.");
    }
    findings.push({
      id: crypto.randomUUID(),
      slateDate: ctx.slateDate,
      playerId: playerId || null,
      teamId: teamId || null,
      sourceUrl,
      publishedAt,
      retrievedAt: ctx.retrievedAt,
      summary,
      kind,
      availability,
      suggestedMinutes,
      suggestedRole,
      conflict: false,
      appliedAt: null,
      flags,
    });
  }
  return { findings, discarded };
}

export function markConflicts(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!finding.playerId) continue;
    const list = groups.get(finding.playerId) ?? [];
    list.push(finding);
    groups.set(finding.playerId, list);
  }
  const conflicts = new Set<string>();
  for (const list of groups.values()) {
    const availability = new Set(list.map((f) => f.availability).filter((v): v is string => Boolean(v)));
    const minutes = list.map((f) => f.suggestedMinutes).filter((m): m is number => m != null);
    if (availability.size > 1 || (minutes.length >= 2 && Math.max(...minutes) - Math.min(...minutes) > 5)) {
      list.forEach((f) => conflicts.add(f.id));
    }
  }
  return findings.map((f) => (conflicts.has(f.id) ? { ...f, conflict: true, flags: f.flags.includes("Conflicting reports.") ? f.flags : [...f.flags, "Conflicting reports."] } : f));
}

export function mergeFindings(existing: Finding[], incoming: Finding[]): Finding[] {
  const rows = existing.slice();
  for (const finding of incoming) {
    const at = rows.findIndex((row) =>
      row.slateDate === finding.slateDate
      && row.playerId === finding.playerId
      && row.sourceUrl === finding.sourceUrl
      && row.summary === finding.summary);
    if (at === -1) rows.push(finding);
    else {
      rows[at] = {
        ...finding,
        id: rows[at].id,
        appliedAt: rows[at].appliedAt,
        retrievedAt: finding.retrievedAt,
      };
    }
  }
  return markConflicts(rows);
}

export function applyMinutesSuggestion(db: Database, findingId: string, appliedAt: string): { db: Database; error?: string } {
  const finding = db.research.find((f) => f.id === findingId);
  if (!finding) return { db, error: "Finding not found." };
  if (finding.suggestedMinutes == null) return { db, error: "This finding has no minutes suggestion to review." };
  if (!finding.playerId) return { db, error: "The suggestion is not tied to a player id, so nothing was changed." };
  const player = db.players.find((p) => idsEqual(p.playerId, finding.playerId as string));
  if (!player) return { db, error: "Player id from the finding is not in the roster." };
  const game = db.games.find((g) =>
    g.gameDate === finding.slateDate
    && g.season === CURRENT_SEASON
    && (g.homeTeamId === player.teamId || g.awayTeamId === player.teamId));
  if (!game) return { db, error: "No game on that date for this player." };
  if (locked(db, player.playerId, game.gameId)) {
    return { db, error: "Actuals are stored. Minutes were not overwritten." };
  }
  const updated = setMinutesOverride(db, player.playerId, game.gameId, finding.suggestedMinutes);
  if (updated.error) return updated;
  return {
    db: {
      ...updated.db,
      research: updated.db.research.map((f) => (f.id === findingId ? { ...f, appliedAt } : f)),
    },
  };
}

export function recordsFromObjects(list: unknown[]): { rowNumber: number; values: Raw }[] {
  return list.map((item, index) => {
    const values: Raw = {};
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const [key, value] of Object.entries(item)) {
        if (value == null) values[key.toLowerCase()] = "";
        else if (typeof value === "string") values[key.toLowerCase()] = value.trim();
        else if (typeof value === "number" && Number.isFinite(value)) values[key.toLowerCase()] = String(value);
        else if (typeof value === "boolean") values[key.toLowerCase()] = value ? "true" : "false";
      }
    }
    return { rowNumber: index + 1, values };
  });
}
