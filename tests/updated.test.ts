import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_SEASON, buildSlate, emptyDatabase, finishRun, setBetUnits, setPropLine, updateSettings, type PregameStat } from "../lib/engine.ts";
import { slateSavedAt } from "../lib/engine.ts";
import { clockInstant, formatUpdated, runClock } from "../lib/updated.ts";

test("formatUpdated is Central time without a date", () => {
  assert.equal(formatUpdated(new Date("2026-11-14T03:48:00Z")), "Updated 9:48 PM");
  assert.equal(formatUpdated(new Date("2026-11-14T16:05:00Z")), "Updated 10:05 AM");
  assert.equal(formatUpdated(new Date("not-a-time")), "");
});

test("the status names Projections or Lines and keeps both times", () => {
  const projectionsAt = new Date("2026-11-14T21:57:00Z");
  const linesAt = new Date("2026-11-14T22:10:00Z");
  assert.equal(runClock({ running: "Projections", projectionsAt: null, linesAt: null }), "Running Projections");
  assert.equal(runClock({ running: "Lines", projectionsAt: null, linesAt: null }), "Running Lines");
  assert.equal(runClock({ running: null, projectionsAt, linesAt: null }), "Projections 3:57 PM");
  assert.equal(runClock({ running: null, projectionsAt: null, linesAt }), "Lines 4:10 PM");
  assert.equal(runClock({ running: null, projectionsAt, linesAt }), "Projections 3:57 PM · Lines 4:10 PM");
  assert.equal(runClock({ running: null, projectionsAt: null, linesAt: null }), "");
});

test("saved finish times show on the slate, and a settings save or a bet leaves them", () => {
  const gameId = "2026-11-14|MIA@BOS";
  const playerId = "p";
  const started = finishRun(finishRun({
    ...emptyDatabase(),
    players: [{ playerId, displayName: "A Player", teamId: "BOS", position: "PG", season: CURRENT_SEASON }],
    games: [{ gameId, season: CURRENT_SEASON, gameDate: "2026-11-14", homeTeamId: "BOS", awayTeamId: "MIA", status: "scheduled" }],
    projections: [{ playerId, gameId, source: "sportsline", season: CURRENT_SEASON, points: 30, rebounds: 8, minutes: 34, sourceTimestamp: "2026-11-14T18:00:00Z" }],
  }, "projections", "2026-11-14T21:57:00Z"), "lines", "2026-11-14T22:10:00Z");
  assert.equal(started.runStamps.projectionsAt, "2026-11-14T21:57:00.000Z");
  assert.equal(started.runStamps.linesAt, "2026-11-14T22:10:00.000Z");
  assert.equal(finishRun(started, "projections", "not-a-time").runStamps.projectionsAt, started.runStamps.projectionsAt);
  const onlyLines = finishRun(emptyDatabase(), "lines", "2026-11-14T22:10:00Z");
  assert.equal(onlyLines.runStamps.projectionsAt, null);
  assert.equal(onlyLines.runStamps.linesAt, "2026-11-14T22:10:00.000Z");

  const settings = updateSettings(started, { ...started.settings, dvpPointsStrength: 4 });
  assert.equal(settings.error, undefined);
  assert.equal(settings.db.settings.dvpPointsStrength, 4);
  assert.deepEqual(settings.db.runStamps, started.runStamps);

  const typed = setPropLine(settings.db, playerId, gameId, "points", 24.5, "2026-11-14T22:20:00Z");
  const bet = setBetUnits(typed.db, playerId, gameId, "points", 1, "2026-11-14T22:21:00Z");
  assert.equal(bet.error, undefined);
  assert.equal(bet.db.lines[0]?.units, 1);
  assert.deepEqual(bet.db.runStamps, started.runStamps);
  assert.equal(bet.db.pregame[0]?.projection, typed.db.pregame[0]?.projection);

  const slate = buildSlate(bet.db, "2026-11-14");
  assert.equal(slate.projectionsAt, started.runStamps.projectionsAt);
  assert.equal(slate.linesAt, started.runStamps.linesAt);
  assert.equal(runClock({
    running: null,
    projectionsAt: clockInstant(slate.projectionsAt),
    linesAt: clockInstant(slate.linesAt),
  }), "Projections 3:57 PM · Lines 4:10 PM");
  assert.equal(runClock({
    running: "Projections",
    projectionsAt: clockInstant(slate.projectionsAt),
    linesAt: clockInstant(slate.linesAt),
  }), "Running Projections");
  assert.equal(clockInstant("not-a-time"), null);
  assert.equal(clockInstant(null), null);
});

test("slate saved time is the newest stored stamp for that date", () => {
  const db = emptyDatabase();
  db.games.push(
    { gameId: "g1", season: CURRENT_SEASON, gameDate: "2026-11-13", homeTeamId: "BOS", awayTeamId: "MIA", status: "scheduled" },
    { gameId: "g2", season: CURRENT_SEASON, gameDate: "2026-11-12", homeTeamId: "NYK", awayTeamId: "PHI", status: "scheduled" },
  );
  db.projections.push(
    { playerId: "p", gameId: "g1", source: "sportsline", season: CURRENT_SEASON, points: 20, rebounds: 8, minutes: 30, sourceTimestamp: "2026-11-13T20:00:00Z" },
    { playerId: "p", gameId: "g2", source: "sportsline", season: CURRENT_SEASON, points: 18, rebounds: 7, minutes: 28, sourceTimestamp: "2026-11-13T23:30:00Z" },
    { playerId: "p", gameId: "g1", source: "dimers", season: CURRENT_SEASON, points: null, rebounds: null, minutes: null, sourceTimestamp: "not-a-time" },
  );
  db.lines.push({
    playerId: "p",
    gameId: "g1",
    stat: "points",
    season: CURRENT_SEASON,
    line: 19.5,
    overOdds: -110,
    underOdds: -110,
    source: "consensus",
    sourceTimestamp: "2026-11-13T21:30:00Z",
  });
  const saved: PregameStat = {
    playerId: "p",
    gameId: "g1",
    stat: "points",
    slateDate: "2026-11-13",
    baseline: 20,
    projection: 21,
    minutes: 30,
    adjustments: [],
    flags: [],
    line: 19.5,
    overOdds: -110,
    underOdds: -110,
    savedAt: "2026-11-13T22:15:00Z",
    sourcesUsed: [],
  };
  db.pregame.push(saved, { ...saved, slateDate: "2026-11-01", savedAt: "2026-11-13T23:59:00Z" });

  assert.equal(slateSavedAt(db, "2026-11-13"), "2026-11-13T22:15:00.000Z");
  assert.equal(slateSavedAt(db, "2026-11-12"), "2026-11-13T23:30:00.000Z");
  assert.equal(slateSavedAt(emptyDatabase(), "2026-11-13"), null);
});
