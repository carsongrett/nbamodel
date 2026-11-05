import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalizeDatabase, emptyDatabase, mergeSettings, type Actual, type Database, type Dvp, type DvpWindow, type Finding, type Game, type IdMap, type MinutesOverride, type OppRebound, type OutsideProjection, type PaceRow, type Player, type PlayerRate, type PregameStat, type PropLine, type Settings, type Team, type Vegas } from "./engine";

export type StorageMode = "local" | "supabase";

export function storageMessage(mode: StorageMode): string {
  if (mode === "supabase") {
    return "Saving to Supabase with the server service role. The browser does not query the database.";
  }
  return "Saving to a local file on this server. Imports and the model run without Supabase. Set the Supabase variables for hosted storage.";
}

interface Store {
  mode: StorageMode;
  read(): Promise<Database>;
  write(db: Database): Promise<void>;
}

let queue: Promise<void> = Promise.resolve();

function locked(fn: () => Promise<void>): Promise<void> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

export function getStore(): Store {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  return new FileStore(process.env.LOCAL_STORE_PATH || path.join(process.cwd(), "data", "local-store.json"));
}

export async function updateDatabase<T>(mutate: (db: Database) => { db?: Database; result: T } | Promise<{ db?: Database; result: T }>): Promise<T> {
  const store = getStore();
  let result!: T;
  await locked(async () => {
    const db = canonicalizeDatabase(await store.read());
    const out = await mutate(db);
    if (out.db) await store.write(out.db);
    result = out.result;
  });
  return result;
}

class FileStore implements Store {
  mode: StorageMode = "local";
  constructor(private file: string) {}

  async read(): Promise<Database> {
    try {
      const text = await readFile(this.file, "utf8");
      const parsed = JSON.parse(text) as Database;
      return { ...emptyDatabase(), ...parsed, settings: mergeSettings(parsed.settings) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDatabase();
      throw error;
    }
  }

  async write(db: Database): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(db, null, 2));
  }
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value);
  return text === "" ? null : text;
}

class SupabaseStore implements Store {
  mode: StorageMode = "supabase";
  constructor(private client: SupabaseClient) {}

  async read(): Promise<Database> {
    const [
      teams, players, games, idMap, projections, lines, rates, dvp, pace, oppRebounds, vegas, settings, overrides, pregame, actuals, research,
    ] = await Promise.all([
      this.select("teams"),
      this.select("players"),
      this.select("games"),
      this.select("source_id_map"),
      this.select("outside_projections"),
      this.select("prop_lines"),
      this.select("player_rates"),
      this.select("dvp"),
      this.select("pace"),
      this.select("opp_rebounds"),
      this.select("vegas"),
      this.select("settings"),
      this.select("overrides"),
      this.select("pregame"),
      this.select("actuals"),
      this.select("research_findings"),
    ]);
    const settingRow = settings[0] ?? {};
    return {
      teams: teams.map((row) => ({ teamId: String(row.team_id), name: String(row.name) })),
      players: players.map((row) => ({
        playerId: String(row.player_id),
        displayName: String(row.display_name),
        teamId: String(row.team_id),
        position: row.position as Player["position"],
        season: String(row.season),
      })),
      games: games.map((row) => ({
        gameId: String(row.game_id),
        season: String(row.season),
        gameDate: String(row.game_date).slice(0, 10),
        homeTeamId: String(row.home_team_id),
        awayTeamId: String(row.away_team_id),
        status: row.status as Game["status"],
        tipAt: str(row.tip_at),
      })),
      idMap: idMap.map((row) => ({
        source: String(row.source),
        entityType: row.entity_type as IdMap["entityType"],
        sourceId: String(row.source_id),
        canonicalId: String(row.canonical_id),
      })),
      projections: projections.map((row) => ({
        playerId: String(row.player_id),
        gameId: String(row.game_id),
        source: String(row.source),
        season: String(row.season),
        points: num(row.points),
        rebounds: num(row.rebounds),
        minutes: num(row.minutes),
        sourceTimestamp: str(row.source_timestamp),
      })),
      lines: lines.map((row) => ({
        playerId: String(row.player_id),
        gameId: String(row.game_id),
        stat: row.stat as PropLine["stat"],
        season: String(row.season),
        line: num(row.line) ?? 0,
        overOdds: num(row.over_odds),
        underOdds: num(row.under_odds),
        source: str(row.source),
        sourceTimestamp: str(row.source_timestamp),
        units: num(row.units),
      })),
      rates: rates.map((row) => ({
        playerId: String(row.player_id),
        season: String(row.season),
        ptsPer100: num(row.pts_per_100),
        ptsPer100Games: num(row.pts_per_100_games),
        usgPct: num(row.usg_pct),
        usgGames: num(row.usg_games),
        rebPerMinute: num(row.reb_per_minute),
        rebPerMinuteGames: num(row.reb_per_minute_games),
        recentPointsPerGame: num(row.recent_points_per_game),
        recentReboundsPerGame: num(row.recent_rebounds_per_game),
        recentGames: num(row.recent_games),
        sourceTimestamp: str(row.source_timestamp),
      })),
      dvp: dvp.map((row) => ({
        teamId: String(row.team_id),
        position: row.position as Dvp["position"],
        season: String(row.season),
        pointsDiff: num(row.points_diff),
        reboundsDiff: num(row.rebounds_diff),
        pointsWindow: dvpWindow(row.points_window),
        reboundsWindow: dvpWindow(row.rebounds_window),
        sourceTimestamp: str(row.source_timestamp),
      })),
      pace: pace.map((row) => ({
        teamId: String(row.team_id),
        season: String(row.season),
        pace: num(row.pace),
        paceDiff: num(row.pace_diff),
        sourceTimestamp: str(row.source_timestamp),
      })),
      oppRebounds: oppRebounds.map((row) => ({
        teamId: String(row.team_id),
        season: String(row.season),
        reboundDiff: num(row.rebound_diff),
        sourceTimestamp: str(row.source_timestamp),
      })),
      vegas: vegas.map((row) => ({
        gameId: String(row.game_id),
        teamId: String(row.team_id),
        season: String(row.season),
        spread: num(row.spread) ?? 0,
        total: num(row.total) ?? 0,
        sourceTimestamp: str(row.source_timestamp),
      })),
      settings: mergeSettings({
        dvpPointsStrength: num(settingRow.dvp_points_strength) ?? undefined,
        dvpReboundsStrength: num(settingRow.dvp_rebounds_strength) ?? undefined,
        pacePointsStrength: num(settingRow.pace_points_strength) ?? undefined,
        paceReboundsStrength: num(settingRow.pace_rebounds_strength) ?? undefined,
        recentPointsStrength: num(settingRow.recent_points_strength) ?? undefined,
        recentReboundsStrength: num(settingRow.recent_rebounds_strength) ?? undefined,
        minutesPointsStrength: num(settingRow.minutes_points_strength) ?? undefined,
        minutesReboundsStrength: num(settingRow.minutes_rebounds_strength) ?? undefined,
        oppReboundsStrength: num(settingRow.opp_rebounds_strength) ?? undefined,
        minRecentGames: num(settingRow.min_recent_games) ?? undefined,
        minRateGames: num(settingRow.min_rate_games) ?? undefined,
      }),
      overrides: overrides.map((row) => ({ playerId: String(row.player_id), gameId: String(row.game_id), minutes: num(row.minutes) ?? 0 })),
      pregame: pregame.map((row) => ({
        playerId: String(row.player_id),
        gameId: String(row.game_id),
        stat: row.stat as PregameStat["stat"],
        slateDate: String(row.slate_date).slice(0, 10),
        baseline: num(row.baseline),
        projection: num(row.projection),
        minutes: num(row.minutes),
        adjustments: Array.isArray(row.adjustments) ? row.adjustments as PregameStat["adjustments"] : [],
        flags: Array.isArray(row.flags) ? row.flags as string[] : [],
        line: num(row.line),
        overOdds: num(row.over_odds),
        underOdds: num(row.under_odds),
        units: num(row.units),
        savedAt: String(row.saved_at),
        sourcesUsed: Array.isArray(row.sources_used) ? row.sources_used as string[] : [],
      })),
      actuals: actuals.map((row) => ({
        playerId: String(row.player_id),
        gameId: String(row.game_id),
        season: String(row.season),
        dnp: Boolean(row.dnp),
        points: num(row.points),
        rebounds: num(row.rebounds),
        sourceTimestamp: str(row.source_timestamp),
      })),
      research: research.map((row) => ({
        id: String(row.id),
        slateDate: String(row.slate_date).slice(0, 10),
        playerId: str(row.player_id),
        teamId: str(row.team_id),
        sourceUrl: str(row.source_url),
        publishedAt: str(row.published_at),
        retrievedAt: String(row.retrieved_at),
        summary: String(row.summary),
        kind: row.kind === "verified" ? "verified" : "inference",
        availability: str(row.availability),
        suggestedMinutes: num(row.suggested_minutes),
        suggestedRole: str(row.suggested_role),
        conflict: Boolean(row.conflict),
        appliedAt: str(row.applied_at),
        flags: Array.isArray(row.flags) ? row.flags as string[] : [],
      })),
    };
  }

  async write(db: Database): Promise<void> {
    const lockedKeys = new Set(db.actuals.map((row) => `${row.playerId}|${row.gameId}`));
    await this.replace("teams", db.teams.map((row: Team) => ({ team_id: row.teamId, name: row.name })), ["team_id"]);
    await this.replace("players", db.players.map((row: Player) => ({
      player_id: row.playerId, display_name: row.displayName, team_id: row.teamId, position: row.position, season: row.season,
    })), ["player_id"]);
    const gameRows = db.games.map((row) => ({
      game_id: row.gameId,
      season: row.season,
      game_date: row.gameDate,
      home_team_id: row.homeTeamId,
      away_team_id: row.awayTeamId,
      status: row.status,
      tip_at: row.tipAt ?? null,
    }));
    try {
      await this.replace("games", gameRows, ["game_id"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("tip_at")) throw error;
      await this.replace("games", gameRows.map(({ tip_at: _tip, ...row }) => row), ["game_id"]);
    }
    await this.replace("source_id_map", db.idMap.map((row) => ({
      source: row.source, entity_type: row.entityType, source_id: row.sourceId, canonical_id: row.canonicalId,
    })), ["source", "entity_type", "source_id"]);
    await this.replace("outside_projections", db.projections.map((row: OutsideProjection) => ({
      player_id: row.playerId, game_id: row.gameId, source: row.source, season: row.season,
      points: row.points, rebounds: row.rebounds, minutes: row.minutes, source_timestamp: row.sourceTimestamp,
    })), ["player_id", "game_id", "source"]);
    await this.replaceUnits("prop_lines", db.lines.map((row) => ({
      player_id: row.playerId, game_id: row.gameId, stat: row.stat, season: row.season, line: row.line,
      over_odds: row.overOdds, under_odds: row.underOdds, source: row.source, source_timestamp: row.sourceTimestamp,
      units: row.units ?? null,
    })), ["player_id", "game_id", "stat"]);
    await this.replace("player_rates", db.rates.map((row: PlayerRate) => ({
      player_id: row.playerId, season: row.season, pts_per_100: row.ptsPer100, pts_per_100_games: row.ptsPer100Games,
      usg_pct: row.usgPct ?? null, usg_games: row.usgGames ?? null,
      reb_per_minute: row.rebPerMinute, reb_per_minute_games: row.rebPerMinuteGames,
      recent_points_per_game: row.recentPointsPerGame, recent_rebounds_per_game: row.recentReboundsPerGame,
      recent_games: row.recentGames, source_timestamp: row.sourceTimestamp,
    })), ["player_id"]);
    const dvpRows = db.dvp.map((row) => ({
      team_id: row.teamId,
      position: row.position,
      season: row.season,
      points_diff: row.pointsDiff,
      rebounds_diff: row.reboundsDiff,
      points_window: row.pointsWindow ?? null,
      rebounds_window: row.reboundsWindow ?? null,
      source_timestamp: row.sourceTimestamp,
    }));
    try {
      await this.replace("dvp", dvpRows, ["team_id", "position"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("points_window") && !message.includes("rebounds_window")) throw error;
      await this.replace("dvp", dvpRows.map(({ points_window: _points, rebounds_window: _rebounds, ...row }) => row), ["team_id", "position"]);
    }
    await this.replace("pace", db.pace.map((row: PaceRow) => ({
      team_id: row.teamId, season: row.season, pace: row.pace, pace_diff: row.paceDiff, source_timestamp: row.sourceTimestamp,
    })), ["team_id"]);
    await this.replace("opp_rebounds", db.oppRebounds.map((row: OppRebound) => ({
      team_id: row.teamId, season: row.season, rebound_diff: row.reboundDiff, source_timestamp: row.sourceTimestamp,
    })), ["team_id"]);
    await this.replace("vegas", db.vegas.map((row: Vegas) => ({
      game_id: row.gameId, team_id: row.teamId, season: row.season, spread: row.spread, total: row.total, source_timestamp: row.sourceTimestamp,
    })), ["game_id", "team_id"]);
    await this.upsert("settings", [settingsRow(db.settings)]);
    await this.replace("overrides", db.overrides.map((row: MinutesOverride) => ({
      player_id: row.playerId, game_id: row.gameId, minutes: row.minutes,
    })), ["player_id", "game_id"]);
    await this.replaceUnits("pregame", db.pregame.filter((row) => !lockedKeys.has(`${row.playerId}|${row.gameId}`)).map((row) => ({
      player_id: row.playerId, game_id: row.gameId, stat: row.stat, slate_date: row.slateDate,
      baseline: row.baseline, projection: row.projection, minutes: row.minutes, adjustments: row.adjustments,
      flags: row.flags, line: row.line, over_odds: row.overOdds, under_odds: row.underOdds,
      units: row.units ?? null,
      saved_at: row.savedAt, sources_used: row.sourcesUsed,
    })), ["player_id", "game_id", "stat"], (row) => !lockedKeys.has(`${row.player_id}|${row.game_id}`));
    await this.replace("actuals", db.actuals.map((row: Actual) => ({
      player_id: row.playerId, game_id: row.gameId, season: row.season, dnp: row.dnp,
      points: row.points, rebounds: row.rebounds, source_timestamp: row.sourceTimestamp,
    })), ["player_id", "game_id"]);
    await this.replace("research_findings", db.research.map((row: Finding) => ({
      id: row.id, slate_date: row.slateDate, player_id: row.playerId, team_id: row.teamId, source_url: row.sourceUrl,
      published_at: row.publishedAt, retrieved_at: row.retrievedAt, summary: row.summary, kind: row.kind,
      availability: row.availability, suggested_minutes: row.suggestedMinutes, suggested_role: row.suggestedRole,
      conflict: row.conflict, applied_at: row.appliedAt, flags: row.flags,
    })), ["id"]);
  }

  private async select(table: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await this.client.from(table).select("*").limit(5000);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  }

  private async upsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from(table).upsert(rows);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  private async replaceUnits(
    table: string,
    rows: Record<string, unknown>[],
    keys: string[],
    canDelete?: (row: Record<string, unknown>) => boolean,
  ): Promise<void> {
    const hasUnits = rows.some((row) => row.units != null);
    try {
      await this.replace(table, rows, keys, canDelete);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("units")) throw error;
      if (hasUnits) {
        throw new Error("Bet units need a database column. Run supabase/migrations/20261105180000_bet_units.sql in the Supabase SQL editor, then save the bet again.");
      }
      await this.replace(table, rows.map(({ units: _units, ...row }) => row), keys, canDelete);
    }
  }

  private async replace(
    table: string,
    rows: Record<string, unknown>[],
    keys: string[],
    canDelete?: (row: Record<string, unknown>) => boolean,
  ): Promise<void> {
    await this.upsert(table, rows);
    const existing = await this.select(table);
    const keep = new Set(rows.map((row) => keys.map((key) => String(row[key])).join("|")));
    for (const row of existing) {
      const id = keys.map((key) => String(row[key])).join("|");
      if (keep.has(id)) continue;
      if (canDelete && !canDelete(row)) continue;
      let query = this.client.from(table).delete();
      for (const key of keys) query = query.eq(key, row[key] as string);
      const { error } = await query;
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
}

function dvpWindow(value: unknown): DvpWindow | null {
  return value === "both" || value === "l15" || value === "l30" ? value : null;
}

function settingsRow(settings: Settings): Record<string, unknown> {
  return {
    id: 1,
    dvp_points_strength: settings.dvpPointsStrength,
    dvp_rebounds_strength: settings.dvpReboundsStrength,
    pace_points_strength: settings.pacePointsStrength,
    pace_rebounds_strength: settings.paceReboundsStrength,
    recent_points_strength: settings.recentPointsStrength,
    recent_rebounds_strength: settings.recentReboundsStrength,
    minutes_points_strength: settings.minutesPointsStrength,
    minutes_rebounds_strength: settings.minutesReboundsStrength,
    opp_rebounds_strength: settings.oppReboundsStrength,
    min_recent_games: settings.minRecentGames,
    min_rate_games: settings.minRateGames,
  };
}
