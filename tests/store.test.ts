import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSlate, CURRENT_SEASON, DEFAULT_SETTINGS, DIMERS_BASELINE_WEIGHT, emptyDatabase, formulaSettings, SPORTSLINE_BASELINE_WEIGHT, type Database, type ProjectionInput } from "../lib/engine.ts";
import { loadOutsideProjections, projectionFromStoreRow, projectionInputFromStoreRow, projectionInputToStoreRow, STORE_PAGE_SIZE, type StorePage } from "../lib/store-pages.ts";

const date = "2026-11-04";
const gameId = `${date}|TOR@LAL`;
const savedAt = "2026-11-04T18:00:00.000Z";

function storeRow(
  playerId: string,
  source: string,
  points: number | null,
  rebounds: number | null,
  minutes: number | null,
): Record<string, unknown> {
  return {
    player_id: playerId,
    game_id: gameId,
    source,
    season: CURRENT_SEASON,
    points,
    rebounds,
    minutes,
    source_timestamp: savedAt,
  };
}

function board(projections: Database["projections"]): Database {
  return {
    ...emptyDatabase(),
    teams: [
      { teamId: "LAL", name: "Lakers" },
      { teamId: "TOR", name: "Raptors" },
    ],
    players: [
      { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON },
      { playerId: "reaveau01", displayName: "Austin Reaves", teamId: "LAL", position: "SG", season: CURRENT_SEASON },
    ],
    games: [{
      gameId,
      season: CURRENT_SEASON,
      gameDate: date,
      homeTeamId: "LAL",
      awayTeamId: "TOR",
      status: "scheduled",
    }],
    projections,
  };
}

test("a saved run restores Dimers with SportsLine, including a missing source", async () => {
  assert.equal(SPORTSLINE_BASELINE_WEIGHT, 0.65);
  assert.equal(DIMERS_BASELINE_WEIGHT, 0.35);
  const sportsline = [
    storeRow("doncilu01", "sportsline", 32.3, 8, 36),
    storeRow("reaveau01", "sportsline", 16, 4, 30),
  ];
  const fillers = Array.from({ length: STORE_PAGE_SIZE - sportsline.length }, (_, index) => storeRow(`player_${index}`, "sportsline", 10, 4, 30));
  const dimers = [
    storeRow("doncilu01", "dimers", 20, 6, null),
    storeRow("reaveau01", "dimers", null, null, null),
  ];
  const stored = [...sportsline, ...fillers, ...dimers];
  const firstPage = stored.slice(0, STORE_PAGE_SIZE).map(projectionFromStoreRow);
  assert.equal(firstPage.some((row) => row.source === "dimers"), false);
  const dropped = buildSlate(board(firstPage.filter((row) => row.playerId === "doncilu01" || row.playerId === "reaveau01")), date);
  const droppedLuka = dropped.rows.find((row) => row.playerId === "doncilu01");
  assert.equal(droppedLuka?.stats.points.baseline, 32.3);
  assert.deepEqual(droppedLuka?.stats.points.sourcesUsed, ["sportsline"]);
  assert.equal(droppedLuka?.stats.points.adjustments.some((row) => row.key === "dimers"), false);
  assert.doesNotMatch(droppedLuka?.stats.points.flags.join(" ") ?? "", /Dimers/);

  const pages: number[] = [];
  const fetchPage = async (from: number, to: number): Promise<StorePage> => {
    pages.push(from);
    return { data: stored.slice(from, to + 1), error: null };
  };
  const loaded = await loadOutsideProjections(fetchPage);
  assert.ok(pages.length > 1);
  assert.equal(loaded.filter((row) => row.source === "dimers").length, 2);

  const slate = buildSlate(board(loaded.filter((row) => row.playerId === "doncilu01" || row.playerId === "reaveau01")), date);
  const luka = slate.rows.find((row) => row.playerId === "doncilu01");
  const reaves = slate.rows.find((row) => row.playerId === "reaveau01");
  const lukaPoints = luka?.stats.points;
  const lukaDimers = lukaPoints?.adjustments.find((row) => row.key === "dimers");
  assert.equal(lukaPoints?.adjustments.find((row) => row.key === "sportsline")?.input, 32.3);
  assert.equal(lukaPoints?.baseline, 32.3 * SPORTSLINE_BASELINE_WEIGHT + 20 * DIMERS_BASELINE_WEIGHT);
  assert.equal(lukaDimers?.input, 20);
  assert.match(lukaDimers?.detail ?? "", /65\/35/);
  assert.equal(luka?.stats.rebounds.adjustments.find((row) => row.key === "dimers")?.input, 6);
  assert.match(luka?.stats.rebounds.adjustments.find((row) => row.key === "dimers")?.detail ?? "", /65\/35/);

  const reavesPoints = reaves?.stats.points;
  assert.equal(reavesPoints?.baseline, 16);
  assert.equal(reavesPoints?.adjustments.find((row) => row.key === "sportsline")?.input, 16);
  assert.equal(reavesPoints?.adjustments.find((row) => row.key === "dimers")?.input, null);
  assert.match(reavesPoints?.flags.join(" ") ?? "", /Dimers points are missing/);
  assert.match(reavesPoints?.adjustments.find((row) => row.key === "dimers")?.detail ?? "", /full points baseline/);
  assert.match(reaves?.stats.rebounds.flags.join(" ") ?? "", /Dimers rebounds are missing/);
  assert.match(reaves?.stats.rebounds.adjustments.find((row) => row.key === "dimers")?.detail ?? "", /full rebounds baseline/);
});

test("projection input columns match the migration", () => {
  const input: ProjectionInput = {
    playerId: "luka",
    gameId: "g1",
    stat: "rebounds",
    slateDate: date,
    savedAt,
    sportsline: 8,
    dimers: null,
    minutes: 36,
    usage: 28.4,
    last15Points: 30,
    last15Rebounds: 9,
    opponentPace: 4,
    defenseVsPosition: -1,
    oppReboundsAllowed: 1.5,
    dvpGap: -1,
    paceGap: 4,
    recentGap: null,
    minutesGap: 1.25,
    oppReboundsGap: 1.5,
    sliders: formulaSettings({ ...DEFAULT_SETTINGS, dvpReboundsStrength: 3, minRecentGames: 4 }),
  };
  const row = projectionInputToStoreRow(input);
  const sql = readFileSync(new URL("../supabase/migrations/20261106120000_projection_inputs.sql", import.meta.url), "utf8");
  for (const column of Object.keys(row)) assert.match(sql, new RegExp(`\\b${column}\\b`));
  assert.equal(row.opp_rebounds_gap, 1.5);
  assert.equal(row.recent_gap, null);
  assert.deepEqual(projectionInputFromStoreRow(row), input);
  assert.equal(projectionInputFromStoreRow({ ...row, stat: "points_rebounds" }), null);
});
