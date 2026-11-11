import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_SEASON,
  applyModelRun,
  applyMinutesSuggestion,
  average,
  blendedReboundsPerMinute,
  buildSlate,
  edgeAndPick,
  emptyDatabase,
  formulaSettings,
  gradeResult,
  idsEqual,
  favoredTeamPoints,
  impliedTeamPoints,
  importBundle,
  importRecords,
  markConflicts,
  mergeFindings,
  normalizeFindings,
  projectPoints,
  projectPointsPlusRebounds,
  projectRebounds,
  recordsFromObjects,
  setMinutesOverride,
  summarize,
  updateSettings,
  upsertByKey,
  mergeSettings,
  weightedDvp,
  weightedOppReboundDiff,
  weightedPace,
  weightedPaceDiff,
  DIMERS_BASELINE_WEIGHT,
  SPORTSLINE_BASELINE_WEIGHT,
  sameNumber,
  setPropLine,
  chicagoDateOf,
  chicagoToday,
  tipLabel,
  type Database,
  type Settings,
  DEFAULT_SETTINGS,
} from "../lib/engine.ts";

const strengths: Settings = { ...DEFAULT_SETTINGS };

function basePoints(overrides: Partial<Parameters<typeof projectPoints>[0]> = {}) {
  return projectPoints({
    sources: [
      { source: "sportsline", value: 30 },
      { source: "other", value: 32 },
      { source: "numberfire", value: 31 },
    ],
    projectedMinutes: 32,
    ptsPer100: 34,
    ptsPer100Games: 10,
    recentPerGame: 33,
    recentGames: 5,
    dvpDiff: 2,
    paceDiff: 1,
    gamePace: 100,
    gamePacePartial: false,
    strengths,
    ...overrides,
  });
}

test("implied team points uses half the signed spread", () => {
  assert.equal(impliedTeamPoints(230.5, -13.5), 122);
  assert.equal(impliedTeamPoints(230.5, 13.5), 108.5);
  assert.equal(impliedTeamPoints(220, 0), 110);
  const workbookFavorite = 230.5 / 2 + Math.abs(-13.5);
  assert.notEqual(impliedTeamPoints(230.5, -13.5), workbookFavorite);
  assert.equal(favoredTeamPoints(230.5, -13.5), workbookFavorite);
  assert.equal(favoredTeamPoints(230.5, 13.5), 230.5 / 2 - 13.5);
});

test("points per 100 possessions are not a share of team points", () => {
  const projection = basePoints({
    sources: [{ source: "sportsline", value: 36.5 }],
    ptsPer100: 36.5,
    ptsPer100Games: 10,
    projectedMinutes: 48,
    teamPoints: 120,
    line: 36.5,
    recentPerGame: 36.5,
    recentGames: 5,
    dvpDiff: 0,
  });
  const minutes = projection.adjustments.find((a) => a.key === "minutes");
  assert.equal(minutes?.status, "skipped");
  assert.match(minutes?.reason ?? "", /not used as a share of team points/);
});

test("a mis-scaled usage rate is skipped instead of applied", () => {
  const projection = basePoints({ usgPct: 0.34, usgGames: 10, teamPoints: 110, line: 20 });
  const minutes = projection.adjustments.find((a) => a.key === "minutes");
  assert.equal(minutes?.status, "skipped");
  assert.match(minutes?.reason ?? "", /mis-scaled/);
  assert.equal(projection.status, "ok");
});

test("recent and minutes subtract the projection baseline, not the betting line", () => {
  const blended = basePoints({
    sources: [
      { source: "sportsline", value: 20 },
      { source: "dimers", value: 30 },
    ],
    line: 40,
    usgPct: 20,
    usgGames: 10,
    teamPoints: 110,
    projectedMinutes: 36,
  });
  const baseline = 20 * 0.65 + 30 * 0.35;
  assert.equal(blended.baseline, baseline);
  const recent = blended.adjustments.find((a) => a.key === "recent");
  assert.equal(recent?.delta, (33 - baseline) / 10);
  assert.equal(recent?.input, 33 - baseline);
  assert.match(recent?.detail ?? "", /points baseline/);
  assert.doesNotMatch(recent?.detail ?? "", /points line/);
  const share = 110 * (36 / 48) * (20 / 100);
  const minutes = blended.adjustments.find((a) => a.key === "minutes");
  assert.equal(minutes?.delta, (share - baseline) / 3);
  assert.match(minutes?.detail ?? "", /points baseline/);
  assert.doesNotMatch(minutes?.detail ?? "", /points line/);
  const otherLine = basePoints({
    sources: [
      { source: "sportsline", value: 20 },
      { source: "dimers", value: 30 },
    ],
    line: 12,
    usgPct: 20,
    usgGames: 10,
    teamPoints: 110,
    projectedMinutes: 36,
  });
  assert.equal(otherLine.projection, blended.projection);
  assert.equal(otherLine.adjustments.find((a) => a.key === "recent")?.delta, recent?.delta);
  assert.equal(otherLine.adjustments.find((a) => a.key === "minutes")?.delta, minutes?.delta);

  const sportslineOnly = basePoints({
    sources: [{ source: "sportsline", value: 28 }],
    line: 20,
    usgPct: 20,
    usgGames: 10,
    teamPoints: 110,
    projectedMinutes: 36,
  });
  assert.equal(sportslineOnly.baseline, 28);
  assert.equal(sportslineOnly.adjustments.find((a) => a.key === "minutes")?.delta, (share - 28) / 3);
  assert.equal(sportslineOnly.adjustments.find((a) => a.key === "recent")?.delta, (33 - 28) / 10);

  assert.equal(basePoints({ paceDiff: 5 }).adjustments.find((a) => a.key === "pace")?.delta, 1);
  assert.equal(basePoints({ paceDiff: null }).adjustments.find((a) => a.key === "pace")?.status, "skipped");
  assert.equal(basePoints({ dvpDiff: 4 }).adjustments.find((a) => a.key === "dvp")?.delta, 4 / 2);
});

test("missing optional adjustments are skipped and a missing baseline blocks", () => {
  const partial = basePoints({ dvpDiff: null, paceDiff: null });
  assert.equal(partial.status, "ok");
  assert.equal(partial.adjustments.find((a) => a.key === "dvp")?.status, "skipped");
  assert.equal(partial.adjustments.find((a) => a.key === "pace")?.status, "skipped");
  assert.ok((partial.projection ?? 0) > 0);
  const blocked = basePoints({
    sources: [
      { source: "sportsline", value: null },
      { source: "other", value: null },
    ],
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.projection, null);
  assert.equal(blocked.adjustments.length, 0);
});

test("partial outside sources are averaged and numberfire is ignored", () => {
  const projection = basePoints({
    sources: [
      { source: "sportsline", value: 20 },
      { source: "other", value: 30 },
      { source: "numberfire", value: 99 },
    ],
  });
  assert.equal(projection.baseline, 25);
  assert.deepEqual(projection.sourcesUsed, ["sportsline", "other"]);
  assert.match(projection.flags.join(" "), /NumberFire/);
});

test("points and rebounds blend SportsLine at 65 and Dimers at 35", () => {
  const points = basePoints({
    sources: [
      { source: "sportsline", value: 20 },
      { source: "dimers", value: 30 },
      { source: "numberfire", value: 99 },
    ],
  });
  assert.equal(points.baseline, 20 * 0.65 + 30 * 0.35);
  assert.deepEqual(points.sourcesUsed, ["sportsline", "dimers"]);
  assert.equal(points.adjustments.find((row) => row.key === "sportsline")?.input, 20);
  const dimers = points.adjustments.find((row) => row.key === "dimers");
  assert.equal(dimers?.input, 30);
  assert.match(dimers?.detail ?? "", /65\/35/);
  assert.match(dimers?.detail ?? "", /0\.65/);
  assert.match(dimers?.detail ?? "", /0\.35/);
  assert.match(points.flags.join(" "), /NumberFire/);
  const deltas = points.adjustments.reduce((sum, row) => sum + (row.delta ?? 0), 0);
  assert.equal(points.projection, (points.baseline ?? 0) + deltas);

  const rebounds = projectRebounds({
    sources: [
      { source: "sportsline", value: 8 },
      { source: "dimers", value: 4 },
    ],
    projectedMinutes: 30,
    rebPerMinute: 0.2,
    rebPerMinuteGames: 10,
    recentPerGame: 8,
    recentGames: 5,
    dvpDiff: 0,
    paceDiff: 0,
    oppReboundDiff: 0,
    strengths,
  });
  const reboundsBaseline = 8 * 0.65 + 4 * 0.35;
  assert.equal(rebounds.baseline, reboundsBaseline);
  assert.equal(rebounds.adjustments.find((row) => row.key === "sportsline")?.input, 8);
  assert.equal(rebounds.adjustments.find((row) => row.key === "dimers")?.input, 4);
  const reboundsRecent = rebounds.adjustments.find((row) => row.key === "recent");
  const reboundsMinutes = rebounds.adjustments.find((row) => row.key === "minutes");
  assert.equal(reboundsRecent?.delta, (8 - reboundsBaseline) / 10);
  assert.equal(reboundsMinutes?.delta, (0.2 * 30 - reboundsBaseline) / 2);
  assert.match(reboundsRecent?.detail ?? "", /rebounds baseline/);
  assert.match(reboundsMinutes?.detail ?? "", /rebounds baseline/);
  assert.doesNotMatch(reboundsRecent?.detail ?? "", /SportsLine|rebounds line/);
  assert.doesNotMatch(reboundsMinutes?.detail ?? "", /SportsLine|rebounds line/);
  assert.equal(rebounds.adjustments.find((row) => row.key === "dvp")?.delta, 0);
  assert.equal(rebounds.adjustments.find((row) => row.key === "pace")?.delta, 0);
  assert.equal(rebounds.adjustments.find((row) => row.key === "opp_rebounds")?.delta, 0);
});

test("a missing SportsLine or Dimers number leaves the other as the full baseline", () => {
  const missingDimers = basePoints({
    sources: [
      { source: "sportsline", value: 20 },
      { source: "dimers", value: null },
      { source: "other", value: 100 },
    ],
  });
  assert.equal(missingDimers.baseline, 20);
  assert.deepEqual(missingDimers.sourcesUsed, ["sportsline"]);
  assert.match(missingDimers.flags.join(" "), /Dimers points are missing/);
  assert.match(missingDimers.adjustments.find((row) => row.key === "dimers")?.detail ?? "", /full points baseline/);
  assert.equal(missingDimers.adjustments.find((row) => row.key === "recent")?.delta, (33 - 20) / 10);
  assert.match(missingDimers.adjustments.find((row) => row.key === "recent")?.detail ?? "", /points baseline/);

  const missingSportsline = projectRebounds({
    sources: [{ source: "dimers", value: 11 }],
    projectedMinutes: 30,
    rebPerMinute: 0.2,
    rebPerMinuteGames: 10,
    recentPerGame: 8,
    recentGames: 5,
    dvpDiff: 0,
    paceDiff: 0,
    oppReboundDiff: 0,
    strengths,
  });
  assert.equal(missingSportsline.baseline, 11);
  assert.deepEqual(missingSportsline.sourcesUsed, ["dimers"]);
  assert.equal(missingSportsline.adjustments.some((row) => row.key === "sportsline"), false);
  assert.match(missingSportsline.flags.join(" "), /SportsLine rebounds are missing/);
  assert.match(missingSportsline.adjustments.find((row) => row.key === "dimers")?.detail ?? "", /full rebounds baseline/);
  assert.equal(missingSportsline.adjustments.find((row) => row.key === "recent")?.delta, (8 - 11) / 10);
  assert.equal(missingSportsline.adjustments.find((row) => row.key === "minutes")?.delta, (0.2 * 30 - 11) / 2);
  assert.match(missingSportsline.adjustments.find((row) => row.key === "recent")?.detail ?? "", /rebounds baseline/);
  assert.match(missingSportsline.adjustments.find((row) => row.key === "minutes")?.detail ?? "", /rebounds baseline/);

  const sportslineOnly = basePoints({ sources: [{ source: "sportsline", value: 20 }] });
  assert.equal(sportslineOnly.baseline, 20);
  assert.equal(sportslineOnly.adjustments.some((row) => row.key === "dimers"), false);
  assert.doesNotMatch(sportslineOnly.flags.join(" "), /Dimers/);
});

test("insufficient recent sample is skipped and not replaced", () => {
  const projection = basePoints({ recentGames: 1, recentPerGame: 50 });
  const recent = projection.adjustments.find((a) => a.key === "recent");
  assert.equal(recent?.status, "skipped");
  assert.match(recent?.reason ?? "", /below the minimum/);
  assert.equal(recent?.delta, null);
});

test("rebounds minutes use per-minute times minutes, and P+R adds the two projections", () => {
  const rebounds = projectRebounds({
    sources: [{ source: "sportsline", value: 8 }],
    projectedMinutes: 30,
    rebPerMinute: 0.2,
    rebPerMinuteGames: 10,
    recentPerGame: 8,
    recentGames: 5,
    dvpDiff: 0,
    paceDiff: 0,
    oppReboundDiff: 0,
    strengths,
    line: 12,
  });
  const minutes = rebounds.adjustments.find((a) => a.key === "minutes");
  assert.equal(minutes?.delta, (0.2 * 30 - 8) / 2);
  assert.match(minutes?.detail ?? "", /rebounds baseline/);
  assert.doesNotMatch(minutes?.detail ?? "", /SportsLine|rebounds line/);
  const changedLine = projectRebounds({
    sources: [{ source: "sportsline", value: 8 }],
    projectedMinutes: 30,
    rebPerMinute: 0.2,
    rebPerMinuteGames: 10,
    recentPerGame: 8,
    recentGames: 5,
    dvpDiff: 0,
    paceDiff: 0,
    oppReboundDiff: 0,
    strengths,
    line: 2,
  });
  assert.equal(rebounds.projection, changedLine.projection);
  const points = basePoints();
  const combined = projectPointsPlusRebounds(points, rebounds);
  assert.equal(combined.projection, (points.projection ?? 0) + (rebounds.projection ?? 0));
  const blocked = projectPointsPlusRebounds(basePoints({ sources: [] }), rebounds);
  assert.equal(blocked.status, "blocked");
});

test("new default divisors apply when nothing was saved, and a saved divisor stays", () => {
  assert.equal(DEFAULT_SETTINGS.dvpPointsStrength, 2);
  assert.equal(DEFAULT_SETTINGS.dvpReboundsStrength, 2);
  assert.equal(DEFAULT_SETTINGS.minutesPointsStrength, 3);
  assert.equal(DEFAULT_SETTINGS.minutesReboundsStrength, 2);
  assert.equal(DEFAULT_SETTINGS.dollarsPerUnit, 10);
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  assert.equal(mergeSettings({ dvpPointsStrength: 4 }).dollarsPerUnit, 10);
  const saved = mergeSettings({
    dvpPointsStrength: 2.5,
    dvpReboundsStrength: 2.5,
    minutesPointsStrength: 3.5,
    minutesReboundsStrength: 2.5,
  });
  assert.equal(saved.dvpPointsStrength, 2.5);
  assert.equal(saved.dvpReboundsStrength, 2.5);
  assert.equal(saved.minutesPointsStrength, 3.5);
  assert.equal(saved.minutesReboundsStrength, 2.5);
  assert.equal(saved.oppReboundsStrength, DEFAULT_SETTINGS.oppReboundsStrength);
  const partial = mergeSettings({ minutesPointsStrength: 3.5 });
  assert.equal(partial.minutesPointsStrength, 3.5);
  assert.equal(partial.dvpPointsStrength, 2);
  assert.equal(partial.dvpReboundsStrength, 2);
  assert.equal(partial.minutesReboundsStrength, 2);
  const points = basePoints({ dvpDiff: 1, strengths: mergeSettings(undefined) });
  assert.equal(points.adjustments.find((row) => row.key === "dvp")?.delta, 1 / 2);
  const rebounds = projectRebounds({
    sources: [{ source: "sportsline", value: 8 }],
    projectedMinutes: 30,
    rebPerMinute: 0.2,
    rebPerMinuteGames: 10,
    recentPerGame: 8,
    recentGames: 5,
    dvpDiff: 1,
    paceDiff: 0,
    oppReboundDiff: 1,
    strengths: mergeSettings({}),
  });
  assert.equal(rebounds.adjustments.find((row) => row.key === "dvp")?.delta, 1 / 2);
  assert.equal(rebounds.adjustments.find((row) => row.key === "minutes")?.delta, (0.2 * 30 - 8) / 2);
  assert.equal(rebounds.adjustments.find((row) => row.key === "opp_rebounds")?.delta, 1 / 10);
  assert.equal(
    basePoints({ strengths: { ...DEFAULT_SETTINGS, dollarsPerUnit: 25 } }).projection,
    basePoints({ strengths: DEFAULT_SETTINGS }).projection,
  );
});

test("workbook input weights", () => {
  assert.equal(weightedDvp(10, 0), 3);
  assert.equal(weightedPace(102, 98), 101);
  assert.equal(weightedPaceDiff(102, 100, 98, 100), 1);
  assert.equal(weightedOppReboundDiff(52, 48, 50), 0.85 * 52 + 0.15 * 48 - 50);
  assert.equal(blendedReboundsPerMinute(10, 0.2), (10 / 36) * 0.5 + 0.1);
});

test("edge and grading", () => {
  assert.deepEqual(edgeAndPick(21, 20), { edge: 1, pick: "over" });
  assert.deepEqual(edgeAndPick(19, 20), { edge: -1, pick: "under" });
  assert.equal(edgeAndPick(20, 20).pick, "none");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: 22, dnp: false, gameFinal: true }).grade, "win");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: 18, dnp: false, gameFinal: true }).grade, "loss");
  assert.equal(gradeResult({ projection: 19, line: 20, actual: 18, dnp: false, gameFinal: true }).grade, "win");
  assert.equal(gradeResult({ projection: 19, line: 20, actual: 23, dnp: false, gameFinal: true }).grade, "loss");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: 20, dnp: false, gameFinal: true }).grade, "push");
  assert.equal(gradeResult({ projection: 20, line: 20, actual: 25, dnp: false, gameFinal: true }).grade, "no_pick");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: 30, dnp: true, gameFinal: true }).grade, "dnp");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: null, dnp: false, gameFinal: true }).grade, "unresolved");
  assert.equal(gradeResult({ projection: 21, line: 20, actual: 22, dnp: false, gameFinal: false }).grade, "unresolved");
  assert.equal(gradeResult({ projection: null, line: 20, actual: 22, dnp: false, gameFinal: true }).grade, "ungraded");
  const summary = summarize([
    { grade: "win", error: 2 },
    { grade: "loss", error: -4 },
    { grade: "push", error: 1 },
    { grade: "dnp", error: null },
    { grade: "unresolved", error: null },
    { grade: "no_pick", error: 3 },
  ]);
  assert.equal(summary.eligible, 2);
  assert.equal(summary.winRate, 0.5);
  assert.equal(summary.meanAbsoluteError, (2 + 4 + 1 + 3) / 4);
});

test("ids match exactly, including near names and near ids", () => {
  assert.equal(idsEqual("player_jayson_tatum", "player_jayson_tatum"), true);
  assert.equal(idsEqual("player_jayson_tatum", "player_jayson_tatums"), false);
  assert.equal(idsEqual("player_jay", "player_jayson"), false);
  assert.equal(idsEqual("Player_Luka", "player_luka"), false);
});

test("season filter, prior-season columns, and name matching", () => {
  let db = emptyDatabase();
  const badSeason = importRecords(db, "player_rates", [
    {
      rowNumber: 2,
      values: {
        player_id: "player_luka",
        season: "2025-26",
        recent_points_per_game: "40",
        recent_games: "10",
      },
    },
  ]);
  assert.equal(badSeason.rejected, 1);
  assert.equal(badSeason.db.rates.length, 0);
  const named = importRecords(db, "projections", [
    {
      rowNumber: 2,
      values: {
        player_name: "Luka Doncic",
        game_id: "game_1",
        season: CURRENT_SEASON,
        source: "sportsline",
        points: "30",
      },
    },
  ]);
  assert.match(named.errors[0].message, /not matched by name/);
  const prior = importRecords(db, "player_rates", [
    {
      rowNumber: 2,
      values: {
        player_id: "player_luka",
        season: CURRENT_SEASON,
        prior_season_ppg: "28",
        recent_points_per_game: "",
        recent_games: "",
        pts_per_100: "35",
        pts_per_100_games: "8",
      },
    },
  ]);
  assert.equal(prior.inserted, 1);
  assert.match(prior.warnings[0], /Ignored prior-season/);
  assert.equal(prior.db.rates[0].recentPointsPerGame, null);
  assert.equal(prior.db.rates[0].ptsPer100, 35);
  db = prior.db;
  db = {
    ...db,
    players: [{ playerId: "player_luka", displayName: "Luka Doncic", teamId: "DAL", position: "PG", season: CURRENT_SEASON }],
    games: [{ gameId: "game_1", season: CURRENT_SEASON, gameDate: "2026-11-01", homeTeamId: "BOS", awayTeamId: "DAL", status: "scheduled" }],
    projections: [{
      playerId: "player_luka",
      gameId: "game_1",
      source: "sportsline",
      season: CURRENT_SEASON,
      points: 30,
      rebounds: null,
      minutes: 34,
      sourceTimestamp: "2026-11-01",
    }],
    rates: [
      ...db.rates,
      {
        playerId: "player_luka",
        season: "2024-25",
        ptsPer100: 99,
        ptsPer100Games: 70,
        rebPerMinute: null,
        rebPerMinuteGames: null,
        recentPointsPerGame: 40,
        recentReboundsPerGame: null,
        recentGames: 20,
        sourceTimestamp: null,
      },
    ],
  };
  const slate = buildSlate(db, "2026-11-01");
  const row = slate.rows[0];
  assert.match(row.stats.points.flags.join(" "), /prior-season/i);
  const recent = row.stats.points.adjustments.find((a) => a.key === "recent");
  assert.equal(recent?.status, "skipped");
});

test("duplicate imports upsert and component blends fill prepared fields", () => {
  const first = importRecords(emptyDatabase(), "projections", [
    { rowNumber: 2, values: { player_id: "p1", game_id: "g1", season: CURRENT_SEASON, source: "sportsline", points: "10", minutes: "20" } },
    { rowNumber: 3, values: { player_id: "p1", game_id: "g1", season: CURRENT_SEASON, source: "sportsline", points: "12", minutes: "22" } },
  ]);
  assert.equal(first.db.projections.length, 1);
  assert.equal(first.inserted, 1);
  assert.equal(first.updated, 1);
  assert.equal(first.db.projections[0].points, 12);
  const second = importRecords(first.db, "projections", [
    { rowNumber: 2, values: { player_id: "p1", game_id: "g1", season: CURRENT_SEASON, source: "sportsline", points: "14", minutes: "23" } },
  ]);
  assert.equal(second.db.projections.length, 1);
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 1);
  const blended = importRecords(emptyDatabase(), "pace", [
    {
      rowNumber: 2,
      values: {
        team_id: "BOS",
        season: CURRENT_SEASON,
        pace_l10: "102",
        pace_season: "98",
        league_pace_l10: "100",
        league_pace_season: "100",
      },
    },
  ]);
  assert.equal(blended.db.pace[0].pace, 101);
  assert.equal(blended.db.pace[0].paceDiff, 1);
  const mapFirst = importRecords(emptyDatabase(), "id_map", [
    { rowNumber: 2, values: { source: "sportsline", entity_type: "player", source_id: "sl-luka", canonical_id: "player_luka" } },
  ]);
  const mapped = importRecords(mapFirst.db, "projections", [
    {
      rowNumber: 2,
      values: {
        source: "sportsline",
        source_player_id: "sl-luka",
        game_id: "g1",
        season: CURRENT_SEASON,
        points: "31",
        player_name: "Someone Else",
      },
    },
  ]);
  assert.equal(mapped.db.projections[0].playerId, "player_luka");
  const unmapped = importRecords(mapFirst.db, "projections", [
    { rowNumber: 2, values: { source: "sportsline", source_player_id: "sl-luka-typo", game_id: "g1", season: CURRENT_SEASON, points: "10" } },
  ]);
  assert.equal(unmapped.rejected, 1);
  assert.equal(unmapped.db.projections.length, 0);
});

test("pregame records stay fixed after actuals", () => {
  let db: Database = emptyDatabase();
  db = importBundle(db, {
    teams: recordsFromObjects([{ team_id: "DAL", name: "Dallas" }, { team_id: "BOS", name: "Boston" }]),
    players: recordsFromObjects([{ player_id: "player_luka", display_name: "Luka Doncic", team_id: "DAL", position: "PG", season: CURRENT_SEASON }]),
    games: recordsFromObjects([{ game_id: "g1", season: CURRENT_SEASON, game_date: "2026-11-01", home_team_id: "BOS", away_team_id: "DAL", status: "scheduled" }]),
    projections: recordsFromObjects([{ player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, source: "sportsline", points: "30", rebounds: "8", minutes: "34", source_timestamp: "2026-11-01T18:00:00Z" }]),
    lines: recordsFromObjects([
      { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, stat: "points", line: "28.5", over_odds: "-115", under_odds: "-105" },
      { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, stat: "rebounds", line: "7.5", over_odds: "-110", under_odds: "-110" },
      { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, stat: "points_rebounds", line: "36.5", over_odds: "-120", under_odds: "+100" },
    ]),
  }).db;
  const ran = applyModelRun(db, "2026-11-01", "2026-11-01T16:00:00.000Z");
  db = ran.db;
  const saved = db.pregame.find((p) => p.stat === "points");
  assert.ok(saved);
  assert.equal(saved?.line, 28.5);
  assert.equal(saved?.overOdds, -115);
  assert.equal(saved?.savedAt, "2026-11-01T16:00:00.000Z");
  const savedProjection = saved?.projection;
  db = importRecords(db, "actuals", [
    { rowNumber: 2, values: { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, dnp: "false", points: "40", rebounds: "10" } },
  ]).db;
  db = importRecords(db, "games", [
    { rowNumber: 2, values: { game_id: "g1", season: CURRENT_SEASON, game_date: "2026-11-01", home_team_id: "BOS", away_team_id: "DAL", status: "final" } },
  ]).db;
  db = importRecords(db, "lines", [
    { rowNumber: 2, values: { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, stat: "points", line: "50", over_odds: "-200", under_odds: "+180" } },
  ]).db;
  db = importRecords(db, "projections", [
    { rowNumber: 2, values: { player_id: "player_luka", game_id: "g1", season: CURRENT_SEASON, source: "sportsline", points: "99", rebounds: "20", minutes: "40" } },
  ]).db;
  const again = applyModelRun(db, "2026-11-01", "2026-11-02T12:00:00.000Z");
  const locked = again.db.pregame.find((p) => p.stat === "points");
  assert.equal(locked?.projection, savedProjection);
  assert.equal(locked?.line, 28.5);
  assert.equal(locked?.overOdds, -115);
  assert.equal(locked?.underOdds, -105);
  assert.equal(locked?.savedAt, "2026-11-01T16:00:00.000Z");
  const slate = buildSlate(again.db, "2026-11-01");
  assert.equal(slate.rows[0].stats.points.source, "saved");
  assert.equal(slate.rows[0].stats.points.projection, savedProjection);
  assert.equal(slate.rows[0].stats.points.line, 28.5);
  assert.equal(slate.rows[0].stats.points.grade, "win");
  assert.equal(slate.rows[0].locked, true);
});

test("results distinguish push, no pick, DNP, and unresolved", () => {
  const rows = [
    ["player_win", 30, 28.5, 33, false, "final", "win"],
    ["player_push", 20, 18.5, 18.5, false, "final", "push"],
    ["player_none", 15, 15, 22, false, "final", "no_pick"],
    ["player_dnp", 12, 11.5, "", true, "final", "dnp"],
    ["player_live", 18, 17.5, 19, false, "in_progress", "unresolved"],
  ] as const;
  let db = emptyDatabase();
  db.teams = [{ teamId: "MIL", name: "Milwaukee" }, { teamId: "MIA", name: "Miami" }];
  db.games = [{ gameId: "g", season: CURRENT_SEASON, gameDate: "2026-10-31", homeTeamId: "MIA", awayTeamId: "MIL", status: "final" }];
  for (const [id, projection, line, actual, dnp, status] of rows) {
    db.players.push({ playerId: id, displayName: id, teamId: "MIL", position: "SF", season: CURRENT_SEASON });
    db.pregame.push({
      playerId: id,
      gameId: "g",
      stat: "points",
      slateDate: "2026-10-31",
      baseline: projection,
      projection,
      minutes: 30,
      adjustments: [],
      flags: [],
      line,
      overOdds: -110,
      underOdds: -110,
      savedAt: "2026-10-31T15:00:00.000Z",
      sourcesUsed: ["sportsline"],
    });
    if (status !== "in_progress") {
      db.actuals.push({
        playerId: id,
        gameId: "g",
        season: CURRENT_SEASON,
        dnp,
        points: actual === "" ? null : Number(actual),
        rebounds: dnp ? null : 5,
        sourceTimestamp: "2026-10-31",
      });
    }
  }
  db.actuals = db.actuals.filter((a) => a.playerId !== "player_live");
  db.games[0].status = "scheduled";
  const scheduled = buildSlate(db, "2026-10-31");
  assert.equal(scheduled.rows.find((r) => r.playerId === "player_win")?.stats.points.grade, "unresolved");
  db.games[0].status = "final";
  const finalSlate = buildSlate(db, "2026-10-31");
  assert.equal(finalSlate.rows.find((r) => r.playerId === "player_win")?.stats.points.grade, "win");
  assert.equal(finalSlate.rows.find((r) => r.playerId === "player_push")?.stats.points.grade, "push");
  assert.equal(finalSlate.rows.find((r) => r.playerId === "player_none")?.stats.points.grade, "no_pick");
  assert.equal(finalSlate.rows.find((r) => r.playerId === "player_dnp")?.stats.points.grade, "dnp");
  assert.equal(finalSlate.rows.find((r) => r.playerId === "player_live")?.stats.points.grade, "unresolved");
  const summary = finalSlate.summaries.points;
  assert.equal(summary.eligible, 1);
  assert.equal(summary.pushes, 1);
  assert.equal(summary.dnps, 1);
  assert.equal(summary.noPicks, 1);
  assert.equal(summary.unresolved, 1);
  assert.equal(summary.winRate, 1);
});

test("research notes match a roster name and drop a name that matches nobody", () => {
  const roster = [
    { playerId: "player_luka", displayName: "Luka Doncic", teamId: "DAL" },
    { playerId: "player_luka", displayName: "Luka Doncic", teamId: "DAL" },
    { playerId: "player_kyrie", displayName: "Kyrie Irving", teamId: "DAL" },
    { playerId: "player_alex_a", displayName: "Alex Johnson", teamId: "BOS" },
    { playerId: "player_alex_b", displayName: "Alex Johnson", teamId: "LAL" },
  ];
  const { findings, discarded } = normalizeFindings(
    [
      {
        player_id: "guessed_wrong",
        player_name: "Luka Dončić",
        team_id: "LAL",
        source_url: "https://example.com/luka",
        published_at: "2026-11-01T12:00:00Z",
        summary: "Listed as probable.",
        kind: "verified",
        availability: "questionable",
        suggested_minutes: 28,
        apply_now: true,
      },
      {
        player_name: "Luka Doncic",
        source_url: "https://example.com/other-luka",
        summary: "Ruled out with an ankle injury.",
        kind: "verified",
        availability: "out",
      },
      {
        player_id: "player_luka",
        source_url: "https://example.com/luka-2",
        summary: "Expected to start.",
        kind: "verified",
        availability: "available",
        suggested_minutes: 36,
      },
      {
        player_name: "Luka Doncic Jr.",
        source_url: "https://example.com/jr",
        summary: "A different Luka is questionable.",
        kind: "verified",
        availability: "questionable",
      },
      {
        player_name: "Alex Johnson",
        source_url: "https://example.com/alex",
        summary: "Minutes are limited.",
        kind: "verified",
        availability: "minutes_restriction",
      },
      {
        player_name: "Luka Doncic",
        summary: "2024-25 recap of an old injury.",
        kind: "verified",
        source_url: "https://example.com/old",
      },
      {
        player_name: "Luka Doncic",
        summary: "Cap confirmed.",
        kind: "verified",
        source_url: "not a url",
        availability: "minutes_restriction",
        suggested_minutes: 24,
        suggested_role: "capped",
      },
    ],
    { slateDate: "2026-11-01", retrievedAt: "2026-11-01T18:00:00.000Z", roster },
  );
  assert.equal(findings.length, 3);
  assert.ok(findings.every((finding) => finding.playerId === "player_luka" && finding.teamId === "DAL"));
  const probable = findings.find((finding) => finding.summary === "Listed as probable.");
  assert.equal(probable?.kind, "verified");
  assert.equal(probable?.sourceUrl, "https://example.com/luka");
  assert.equal(probable?.publishedAt, "2026-11-01T12:00:00.000Z");
  assert.equal(probable?.suggestedMinutes, 28);
  assert.equal(probable?.appliedAt, null);
  assert.equal(findings.some((finding) => finding.summary === "Expected to start."), false);
  assert.equal(findings.some((finding) => finding.summary.includes("different Luka")), false);
  assert.equal(findings.some((finding) => finding.summary === "Minutes are limited."), false);
  assert.equal(findings.some((finding) => finding.summary.includes("2024-25")), false);
  const unsourced = findings.find((finding) => finding.summary === "Cap confirmed.");
  assert.equal(unsourced?.kind, "inference");
  assert.equal(unsourced?.sourceUrl, null);
  assert.equal(unsourced?.suggestedMinutes, 24);
  assert.equal(unsourced?.suggestedRole, "capped");
  assert.ok(unsourced?.flags.includes("Missing source URL."));
  assert.ok(unsourced?.flags.includes("Verified was removed because there is no source URL."));
  assert.ok(discarded.some((line) => line.includes("without a player name")));
  assert.ok(discarded.some((line) => line.includes("Luka Doncic Jr.") && line.includes("matched nobody")));
  assert.ok(discarded.some((line) => line.includes("Alex Johnson") && line.includes("more than one")));
  assert.ok(discarded.some((line) => line.includes("different season")));
  const merged = markConflicts(findings);
  assert.ok(merged.every((finding) => finding.conflict));
  const stored = mergeFindings([], merged);
  const again = mergeFindings(stored, merged.map((finding) => ({ ...finding, id: "new" })));
  assert.equal(again.length, stored.length);
});

test("a research response that is not a list saves nothing", () => {
  const { findings, discarded } = normalizeFindings(
    { note: "nope" },
    { slateDate: "2026-11-01", retrievedAt: "2026-11-01T18:00:00.000Z", roster: [] },
  );
  assert.equal(findings.length, 0);
  assert.match(discarded[0], /not a list/);
});

test("minutes suggestions are overrides and do not rewrite a saved projection", () => {
  let db = emptyDatabase();
  db.players = [{ playerId: "player_luka", displayName: "Luka", teamId: "DAL", position: "PG", season: CURRENT_SEASON }];
  db.games = [{ gameId: "g1", season: CURRENT_SEASON, gameDate: "2026-11-01", homeTeamId: "BOS", awayTeamId: "DAL", status: "scheduled" }];
  db.pregame = [{
    playerId: "player_luka",
    gameId: "g1",
    stat: "points",
    slateDate: "2026-11-01",
    baseline: 30,
    projection: 31,
    minutes: 34,
    adjustments: [],
    flags: [],
    line: 28.5,
    overOdds: -115,
    underOdds: -105,
    savedAt: "2026-11-01T16:00:00.000Z",
    sourcesUsed: ["sportsline"],
  }];
  db.research = [{
    id: "f1",
    slateDate: "2026-11-01",
    playerId: "player_luka",
    teamId: "DAL",
    sourceUrl: "https://example.com/a",
    publishedAt: null,
    retrievedAt: "2026-11-01T18:00:00.000Z",
    summary: "Minutes cap.",
    kind: "verified",
    availability: "minutes_restriction",
    suggestedMinutes: 24,
    suggestedRole: "capped",
    conflict: false,
    appliedAt: null,
    flags: [],
  }];
  const applied = applyMinutesSuggestion(db, "f1", "2026-11-01T19:00:00.000Z");
  assert.equal(applied.db.overrides[0].minutes, 24);
  assert.equal(applied.db.pregame[0].projection, 31);
  assert.equal(applied.db.pregame[0].minutes, 34);
  assert.equal(applied.db.pregame[0].line, 28.5);
  assert.equal(applied.db.research[0].appliedAt, "2026-11-01T19:00:00.000Z");
});

test("games sort by tip time and the clock is Central", () => {
  assert.equal(tipLabel("2026-11-05T00:00Z"), "6:00 PM CT");
  assert.equal(tipLabel("2026-11-05T00:30:00Z"), "6:30 PM CT");
  assert.equal(tipLabel("2026-11-05T17:00:00+00:00"), "11:00 AM CT");
  assert.equal(tipLabel("2026-07-01T00:00Z"), "7:00 PM CT");
  assert.equal(tipLabel("2026-11-04T23:00Z"), "5:00 PM CT");

  const db = emptyDatabase();
  db.games.push(
    { gameId: "2026-11-04|ATL@WAS", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "WAS", awayTeamId: "ATL", status: "scheduled", tipAt: "2026-11-05T02:00Z" },
    { gameId: "2026-11-04|CHA@BKN", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "BKN", awayTeamId: "CHA", status: "scheduled", tipAt: "2026-11-05T00:00Z" },
    { gameId: "2026-11-04|DEN@LAL", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "LAL", awayTeamId: "DEN", status: "scheduled", tipAt: "2026-11-04T23:30Z" },
    { gameId: "2026-11-04|MIA@BOS", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "BOS", awayTeamId: "MIA", status: "scheduled" },
  );
  const labels = buildSlate(db, "2026-11-04").games.map((game) => `${game.label} ${game.tipLabel ?? "no time"}`);
  assert.deepEqual(labels, [
    "DEN at LAL 5:30 PM CT",
    "CHA at BKN 6:00 PM CT",
    "ATL at WAS 8:00 PM CT",
    "MIA at BOS no time",
  ]);
});

test("chicago date and settings validation", () => {
  assert.equal(chicagoDateOf("2026-11-01T02:00:00Z"), "2026-10-31");
  assert.equal(chicagoToday(new Date("2026-11-01T18:00:00Z")), "2026-11-01");
  const bad = updateSettings(emptyDatabase(), { ...DEFAULT_SETTINGS, dvpPointsStrength: 0 });
  assert.match(bad.error ?? "", /greater than 0/);
  const price = updateSettings(emptyDatabase(), { ...DEFAULT_SETTINGS, dollarsPerUnit: 0 });
  assert.match(price.error ?? "", /Dollars per unit must be greater than 0/);
  const cleared = setMinutesOverride(emptyDatabase(), "missing", "missing", 20);
  assert.match(cleared.error ?? "", /Unknown player/);
});

test("slate lists current-season dates newest first", () => {
  const db = emptyDatabase();
  db.games.push(
    { gameId: "2026-11-01|A@B", season: CURRENT_SEASON, gameDate: "2026-11-01", homeTeamId: "B", awayTeamId: "A", status: "scheduled" },
    { gameId: "2026-10-31|A@B", season: CURRENT_SEASON, gameDate: "2026-10-31", homeTeamId: "B", awayTeamId: "A", status: "final" },
    { gameId: "old", season: "2024-25", gameDate: "2025-01-01", homeTeamId: "B", awayTeamId: "A", status: "final" },
  );
  assert.deepEqual(buildSlate(db, "2026-11-01").dates, ["2026-11-01", "2026-10-31"]);
});

test("upsert keeps a single row per key", () => {
  const once = upsertByKey([{ id: "a", n: 1 }], [{ id: "a", n: 2 }, { id: "b", n: 3 }], (r) => r.id);
  assert.equal(once.rows.length, 2);
  assert.equal(once.updated, 1);
  assert.equal(once.inserted, 1);
  assert.deepEqual(once.rows.map((r) => r.n), [2, 3]);
});

test("a projections save stores pre-division gaps and that day's sliders", () => {
  const date = "2026-11-06";
  const gameId = "g-lal";
  const savedAt = "2026-11-06T18:00:00.000Z";
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    dvpPointsStrength: 4,
    dvpReboundsStrength: 3,
    pacePointsStrength: 6,
    paceReboundsStrength: 8,
    recentPointsStrength: 9,
    recentReboundsStrength: 11,
    minutesPointsStrength: 5,
    minutesReboundsStrength: 4,
    oppReboundsStrength: 7,
    minRecentGames: 3,
    minRateGames: 5,
  };
  const luka = "luka";
  const austin = "austin";
  const max = "max";
  const db: Database = {
    ...emptyDatabase(),
    settings,
    teams: [
      { teamId: "LAL", name: "Lakers" },
      { teamId: "TOR", name: "Raptors" },
    ],
    players: [
      { playerId: luka, displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON },
      { playerId: austin, displayName: "Austin Reaves", teamId: "LAL", position: "PG", season: CURRENT_SEASON },
      { playerId: max, displayName: "Max Christie", teamId: "LAL", position: "PG", season: CURRENT_SEASON },
    ],
    games: [{ gameId, season: CURRENT_SEASON, gameDate: date, homeTeamId: "LAL", awayTeamId: "TOR", status: "scheduled" }],
    projections: [
      { playerId: luka, gameId, source: "sportsline", season: CURRENT_SEASON, points: 30, rebounds: 8, minutes: 36, sourceTimestamp: savedAt },
      { playerId: luka, gameId, source: "dimers", season: CURRENT_SEASON, points: 20, rebounds: 6, minutes: 36, sourceTimestamp: savedAt },
      { playerId: austin, gameId, source: "sportsline", season: CURRENT_SEASON, points: 18, rebounds: 4, minutes: 30, sourceTimestamp: savedAt },
      { playerId: max, gameId, source: "sportsline", season: CURRENT_SEASON, points: 12, rebounds: 3, minutes: 22, sourceTimestamp: savedAt },
    ],
    lines: [
      { playerId: luka, gameId, stat: "points", season: CURRENT_SEASON, line: 24.5, overOdds: -110, underOdds: -110, source: "manual", sourceTimestamp: savedAt },
      { playerId: luka, gameId, stat: "rebounds", season: CURRENT_SEASON, line: 7.5, overOdds: -115, underOdds: -105, source: "manual", sourceTimestamp: savedAt },
      { playerId: luka, gameId, stat: "points_rebounds", season: CURRENT_SEASON, line: 32.5, overOdds: -120, underOdds: 100, source: "manual", sourceTimestamp: savedAt },
      { playerId: austin, gameId, stat: "points", season: CURRENT_SEASON, line: 16.5, overOdds: -110, underOdds: -110, source: "manual", sourceTimestamp: savedAt },
    ],
    rates: [
      {
        playerId: luka, season: CURRENT_SEASON, ptsPer100: null, ptsPer100Games: null,
        usgPct: 28, usgGames: 10, rebPerMinute: 0.2, rebPerMinuteGames: 10,
        recentPointsPerGame: 30, recentReboundsPerGame: 9, recentGames: 10, sourceTimestamp: savedAt,
      },
      {
        playerId: austin, season: CURRENT_SEASON, ptsPer100: null, ptsPer100Games: null,
        usgPct: 22, usgGames: 2, rebPerMinute: 0.15, rebPerMinuteGames: 10,
        recentPointsPerGame: 21, recentReboundsPerGame: 4, recentGames: 1, sourceTimestamp: savedAt,
      },
    ],
    dvp: [{ teamId: "TOR", position: "PG", season: CURRENT_SEASON, pointsDiff: 2, reboundsDiff: -1, sourceTimestamp: savedAt }],
    pace: [{ teamId: "TOR", season: CURRENT_SEASON, pace: 104, paceDiff: 4, sourceTimestamp: savedAt }],
    oppRebounds: [{ teamId: "TOR", season: CURRENT_SEASON, reboundDiff: 1.5, sourceTimestamp: savedAt }],
    vegas: [{ gameId, teamId: "LAL", season: CURRENT_SEASON, spread: -6, total: 220, sourceTimestamp: savedAt }],
  };

  const ran = applyModelRun(db, date, savedAt);
  const inputs = ran.db.projectionInputs;
  assert.deepEqual(inputs.map((row) => `${row.playerId}:${row.stat}`).sort(), [
    `${austin}:points`,
    `${luka}:points`,
    `${luka}:rebounds`,
  ]);

  const pointsBaseline = 30 * SPORTSLINE_BASELINE_WEIGHT + 20 * DIMERS_BASELINE_WEIGHT;
  const teamPoints = favoredTeamPoints(220, -6);
  const pointsMinutesGap = teamPoints * (36 / 48) * (28 / 100) - pointsBaseline;
  const pointsRecentGap = 30 - pointsBaseline;
  const pointsProjection = pointsBaseline
    + 2 / settings.dvpPointsStrength
    + 4 / settings.pacePointsStrength
    + pointsRecentGap / settings.recentPointsStrength
    + pointsMinutesGap / settings.minutesPointsStrength;
  const reboundsBaseline = 8 * SPORTSLINE_BASELINE_WEIGHT + 6 * DIMERS_BASELINE_WEIGHT;
  const reboundsMinutesGap = 0.2 * 36 - reboundsBaseline;
  const reboundsRecentGap = 9 - reboundsBaseline;
  const reboundsProjection = reboundsBaseline
    + -1 / settings.dvpReboundsStrength
    + 4 / settings.paceReboundsStrength
    + reboundsRecentGap / settings.recentReboundsStrength
    + reboundsMinutesGap / settings.minutesReboundsStrength
    + 1.5 / settings.oppReboundsStrength;

  const lukaPoints = inputs.find((row) => row.playerId === luka && row.stat === "points");
  const lukaRebounds = inputs.find((row) => row.playerId === luka && row.stat === "rebounds");
  assert.ok(lukaPoints && lukaRebounds);
  assert.equal(lukaPoints.sportsline, 30);
  assert.equal(lukaPoints.dimers, 20);
  assert.equal(lukaPoints.minutes, 36);
  assert.equal(lukaPoints.usage, 28);
  assert.equal(lukaPoints.last15Points, 30);
  assert.equal(lukaPoints.last15Rebounds, 9);
  assert.equal(lukaPoints.opponentPace, 4);
  assert.equal(lukaPoints.defenseVsPosition, 2);
  assert.equal(lukaPoints.oppReboundsAllowed, 1.5);
  assert.ok(sameNumber(lukaPoints.dvpGap ?? NaN, 2));
  assert.ok(sameNumber(lukaPoints.paceGap ?? NaN, 4));
  assert.ok(sameNumber(lukaPoints.recentGap ?? NaN, pointsRecentGap));
  assert.ok(sameNumber(lukaPoints.minutesGap ?? NaN, pointsMinutesGap));
  assert.equal(lukaPoints.oppReboundsGap, null);
  assert.deepEqual(lukaPoints.sliders, formulaSettings(settings));
  assert.equal("dollarsPerUnit" in lukaPoints.sliders, false);

  assert.equal(lukaRebounds.sportsline, 8);
  assert.equal(lukaRebounds.dimers, 6);
  assert.equal(lukaRebounds.minutes, 36);
  assert.equal(lukaRebounds.usage, 28);
  assert.equal(lukaRebounds.last15Points, 30);
  assert.equal(lukaRebounds.last15Rebounds, 9);
  assert.equal(lukaRebounds.opponentPace, 4);
  assert.equal(lukaRebounds.defenseVsPosition, -1);
  assert.equal(lukaRebounds.oppReboundsAllowed, 1.5);
  assert.ok(sameNumber(lukaRebounds.dvpGap ?? NaN, -1));
  assert.ok(sameNumber(lukaRebounds.paceGap ?? NaN, 4));
  assert.ok(sameNumber(lukaRebounds.recentGap ?? NaN, reboundsRecentGap));
  assert.ok(sameNumber(lukaRebounds.minutesGap ?? NaN, reboundsMinutesGap));
  assert.ok(sameNumber(lukaRebounds.oppReboundsGap ?? NaN, 1.5));
  assert.deepEqual(lukaRebounds.sliders, formulaSettings(settings));

  const savedPoints = ran.db.pregame.find((row) => row.playerId === luka && row.stat === "points");
  const savedRebounds = ran.db.pregame.find((row) => row.playerId === luka && row.stat === "rebounds");
  const savedCombined = ran.db.pregame.find((row) => row.playerId === luka && row.stat === "points_rebounds");
  assert.ok(sameNumber(savedPoints?.projection ?? NaN, pointsProjection));
  assert.ok(sameNumber(savedRebounds?.projection ?? NaN, reboundsProjection));
  assert.ok(sameNumber(savedCombined?.projection ?? NaN, pointsProjection + reboundsProjection));
  const board = buildSlate(ran.db, date).rows.find((row) => row.playerId === luka);
  assert.ok(sameNumber(board?.stats.points.projection ?? NaN, pointsProjection));
  assert.ok(sameNumber(board?.stats.rebounds.projection ?? NaN, reboundsProjection));
  assert.ok(sameNumber(board?.stats.points_rebounds.projection ?? NaN, pointsProjection + reboundsProjection));

  const austinPoints = inputs.find((row) => row.playerId === austin && row.stat === "points");
  assert.ok(austinPoints);
  assert.equal(austinPoints.sportsline, 18);
  assert.equal(austinPoints.dimers, null);
  assert.equal(austinPoints.minutes, 30);
  assert.equal(austinPoints.usage, 22);
  assert.equal(austinPoints.last15Points, 21);
  assert.equal(austinPoints.last15Rebounds, 4);
  assert.equal(austinPoints.recentGap, null);
  assert.equal(austinPoints.minutesGap, null);
  assert.ok(sameNumber(austinPoints.dvpGap ?? NaN, 2));
  assert.ok(sameNumber(austinPoints.paceGap ?? NaN, 4));
  assert.equal(austinPoints.oppReboundsGap, null);
  const austinSaved = ran.db.pregame.find((row) => row.playerId === austin && row.stat === "points");
  assert.ok(sameNumber(austinSaved?.projection ?? NaN, 18 + 2 / settings.dvpPointsStrength + 4 / settings.pacePointsStrength));

  const cleared = setPropLine(ran.db, luka, gameId, "rebounds", null, savedAt);
  assert.equal(cleared.db.projectionInputs.some((row) => row.playerId === luka && row.stat === "rebounds"), false);
  assert.equal(cleared.db.projectionInputs.some((row) => row.playerId === luka && row.stat === "points"), true);
  assert.equal(cleared.db.pregame.some((row) => row.playerId === luka && row.stat === "rebounds"), false);

  const nextStrength = 12;
  const movedAt = "2026-11-06T20:00:00.000Z";
  const moved = applyModelRun({
    ...ran.db,
    settings: { ...settings, dvpPointsStrength: nextStrength },
  }, date, movedAt);
  const movedInput = moved.db.projectionInputs.find((row) => row.playerId === luka && row.stat === "points");
  const movedSaved = moved.db.pregame.find((row) => row.playerId === luka && row.stat === "points");
  assert.equal(movedInput?.savedAt, movedAt);
  assert.ok(sameNumber(movedInput?.dvpGap ?? NaN, 2));
  assert.ok(sameNumber(movedInput?.recentGap ?? NaN, pointsRecentGap));
  assert.ok(sameNumber(movedInput?.minutesGap ?? NaN, pointsMinutesGap));
  assert.equal(movedInput?.sliders.dvpPointsStrength, nextStrength);
  assert.equal(movedInput?.sliders.pacePointsStrength, settings.pacePointsStrength);
  const movedProjection = pointsBaseline
    + 2 / nextStrength
    + 4 / settings.pacePointsStrength
    + pointsRecentGap / settings.recentPointsStrength
    + pointsMinutesGap / settings.minutesPointsStrength;
  assert.ok(sameNumber(movedSaved?.projection ?? NaN, movedProjection));
  assert.ok(sameNumber(buildSlate(moved.db, date).rows.find((row) => row.playerId === luka)?.stats.points.projection ?? NaN, movedProjection));

  const frozenAt = "2026-11-07T12:00:00.000Z";
  const frozen = applyModelRun({
    ...moved.db,
    settings: { ...moved.db.settings, dvpPointsStrength: 2 },
    projections: moved.db.projections.map((row) => row.playerId === luka && row.source === "sportsline" ? { ...row, points: 99 } : row),
    actuals: [{ playerId: luka, gameId, season: CURRENT_SEASON, dnp: false, points: 40, rebounds: 12, sourceTimestamp: frozenAt }],
  }, date, frozenAt);
  const frozenInput = frozen.db.projectionInputs.find((row) => row.playerId === luka && row.stat === "points");
  const frozenSaved = frozen.db.pregame.find((row) => row.playerId === luka && row.stat === "points");
  assert.deepEqual(frozenInput, movedInput);
  assert.equal(frozenSaved?.projection, movedSaved?.projection);
  assert.equal(frozenSaved?.savedAt, movedAt);
  const frozenBoard = buildSlate(frozen.db, date).rows.find((row) => row.playerId === luka);
  assert.equal(frozenBoard?.stats.points.projection, movedSaved?.projection);
  assert.equal(frozenBoard?.stats.points.source, "saved");
  const austinFrozen = frozen.db.projectionInputs.find((row) => row.playerId === austin && row.stat === "points");
  assert.equal(austinFrozen?.savedAt, frozenAt);
  assert.equal(austinFrozen?.sliders.dvpPointsStrength, 2);
  assert.equal(austinFrozen?.sportsline, 18);
});
