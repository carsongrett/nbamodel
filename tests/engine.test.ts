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
  weightedDvp,
  weightedOppReboundDiff,
  weightedPace,
  weightedPaceDiff,
  chicagoDateOf,
  chicagoToday,
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

test("the points line is only the last-15 and minutes-share weight", () => {
  const low = basePoints({ line: 20 });
  const high = basePoints({ line: 40 });
  assert.notEqual(low.projection, high.projection);
  const recent = low.adjustments.find((a) => a.key === "recent");
  assert.equal(recent?.delta, (33 - 20) / 10);
  const weighted = basePoints({
    line: 20,
    usgPct: 20,
    usgGames: 10,
    teamPoints: 110,
    projectedMinutes: 36,
    sources: [{ source: "sportsline", value: 28 }],
  });
  const share = 110 * (36 / 48) * (20 / 100);
  assert.equal(weighted.adjustments.find((a) => a.key === "minutes")?.delta, (share - 20) / 3);
  assert.equal(basePoints({ paceDiff: 5 }).adjustments.find((a) => a.key === "pace")?.delta, 1);
  assert.equal(basePoints({ paceDiff: null }).adjustments.find((a) => a.key === "pace")?.status, "skipped");
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

test("research findings do not name-match and conflicting reports are flagged", () => {
  const { findings, discarded } = normalizeFindings(
    [
      {
        player_id: "player_luka",
        player_name: "Luka Doncic",
        team_id: "DAL",
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
        summary: "This other person is out.",
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
      { summary: "2024-25 recap of an old injury.", kind: "verified", source_url: "https://example.com/old" },
    ],
    { slateDate: "2026-11-01", retrievedAt: "2026-11-01T18:00:00.000Z", playerIds: new Set(["player_luka"]), teamIds: new Set(["DAL"]) },
  );
  assert.equal(findings.length, 3);
  assert.equal(discarded.length, 1);
  const unnamed = findings.find((f) => f.summary.startsWith("This other"));
  assert.equal(unnamed?.playerId, null);
  const merged = markConflicts(findings);
  const luka = merged.filter((f) => f.playerId === "player_luka");
  assert.equal(luka.length, 2);
  assert.ok(luka.every((f) => f.conflict));
  const stored = mergeFindings([], merged);
  const again = mergeFindings(stored, merged.map((f) => ({ ...f, id: "new" })));
  assert.equal(again.length, stored.length);
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

test("chicago date and settings validation", () => {
  assert.equal(chicagoDateOf("2026-11-01T02:00:00Z"), "2026-10-31");
  assert.equal(chicagoToday(new Date("2026-11-01T18:00:00Z")), "2026-11-01");
  const bad = updateSettings(emptyDatabase(), { ...DEFAULT_SETTINGS, dvpPointsStrength: 0 });
  assert.match(bad.error ?? "", /greater than 0/);
  const cleared = setMinutesOverride(emptyDatabase(), "missing", "missing", 20);
  assert.match(cleared.error ?? "", /Unknown player/);
});

test("upsert keeps a single row per key", () => {
  const once = upsertByKey([{ id: "a", n: 1 }], [{ id: "a", n: 2 }, { id: "b", n: 3 }], (r) => r.id);
  assert.equal(once.rows.length, 2);
  assert.equal(once.updated, 1);
  assert.equal(once.inserted, 1);
  assert.deepEqual(once.rows.map((r) => r.n), [2, 3]);
});
