import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_SEASON, emptyDatabase, type PregameStat } from "../lib/engine.ts";
import { slateSavedAt } from "../lib/engine.ts";
import { formatUpdated } from "../lib/updated.ts";

test("formatUpdated is Central time without a date", () => {
  assert.equal(formatUpdated(new Date("2026-11-14T03:48:00Z")), "Updated 9:48 PM");
  assert.equal(formatUpdated(new Date("2026-11-14T16:05:00Z")), "Updated 10:05 AM");
  assert.equal(formatUpdated(new Date("not-a-time")), "");
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
