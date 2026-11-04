import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyModelRun,
  buildSlate,
  emptyDatabase,
  importBundle,
  recordsFromObjects,
  IMPORT_KINDS,
  type ImportKind,
} from "../lib/engine.ts";

const bundle = JSON.parse(readFileSync(new URL("../data/sample/bundle.json", import.meta.url), "utf8")) as Record<string, unknown[]>;

function load(part: "slate" | "actuals") {
  const sections: Partial<Record<ImportKind, ReturnType<typeof recordsFromObjects>>> = {};
  for (const kind of IMPORT_KINDS) {
    if (part === "actuals" && kind !== "actuals") continue;
    if (part === "slate" && kind === "actuals") continue;
    if (Array.isArray(bundle[kind])) sections[kind] = recordsFromObjects(bundle[kind]);
  }
  return sections;
}

test("sample slate imports once, reloads without new rows, and keeps ids exact", () => {
  const first = importBundle(emptyDatabase(), load("slate"));
  assert.equal(first.results.every((result) => result.rejected === 0), true, JSON.stringify(first.results.flatMap((result) => result.errors)));
  const luka = first.db.projections.filter((row) => row.playerId === "player_luka");
  assert.equal(luka.length, 3);
  assert.equal(first.db.players.some((player) => player.displayName === "Luka Doncic" && player.playerId !== "player_luka"), false);
  const second = importBundle(first.db, load("slate"));
  assert.equal(second.db.projections.length, first.db.projections.length);
  assert.equal(second.results.reduce((sum, result) => sum + result.inserted, 0), 0);
  assert.ok(second.results.reduce((sum, result) => sum + result.updated, 0) > 0);
});

test("sample projections use the points line only as a weight", () => {
  const db = importBundle(emptyDatabase(), load("slate")).db;
  const before = buildSlate(db, "2026-11-01");
  const luka = before.rows.find((row) => row.playerId === "player_luka");
  assert.ok(luka);
  assert.equal(luka.impliedTeamPoints, 109);
  const changed = buildSlate({
    ...db,
    lines: db.lines.map((line) => line.playerId === "player_luka" && line.stat === "points" ? { ...line, line: line.line + 10 } : line),
  }, "2026-11-01");
  const lukaAgain = changed.rows.find((row) => row.playerId === "player_luka");
  assert.notEqual(lukaAgain?.stats.points.projection, luka.stats.points.projection);
  assert.notEqual(lukaAgain?.stats.points.edge, luka.stats.points.edge);
  const minutes = luka.stats.points.adjustments.find((item) => item.key === "minutes");
  assert.equal(minutes?.status, "skipped");
  assert.match(minutes?.reason ?? "", /usage percent is missing/);

  const kyrie = before.rows.find((row) => row.playerId === "player_kyrie");
  assert.equal(kyrie?.stats.points.adjustments.find((item) => item.key === "minutes")?.status, "skipped");
  const brown = before.rows.find((row) => row.playerId === "player_brown");
  assert.match(brown?.stats.points.adjustments.find((item) => item.key === "recent")?.reason ?? "", /below the minimum/);
  const tatum = before.rows.find((row) => row.playerId === "player_tatum");
  assert.equal(tatum?.stats.points.projection, null);
  assert.equal(tatum?.stats.rebounds.source, "preview");
  assert.ok(tatum?.stats.rebounds.projection != null);
  assert.equal(tatum?.stats.points_rebounds.projection, null);
  const gafford = before.rows.find((row) => row.playerId === "player_gafford");
  assert.match(gafford?.stats.points.flags.join(" ") ?? "", /Stale/);
  assert.equal(gafford?.stats.points.adjustments.find((item) => item.key === "dvp")?.status, "skipped");
  const white = before.rows.find((row) => row.playerId === "player_white");
  assert.match(white?.stats.rebounds.flags.join(" ") ?? "", /Missing timestamp: rebounds line/);
  assert.equal(white?.stats.rebounds.adjustments.find((item) => item.key === "minutes")?.status, "skipped");
});

test("sample actuals grade the saved pregame record and a rerun does not replace it", () => {
  let db = importBundle(emptyDatabase(), load("slate")).db;
  const ran = applyModelRun(db, "2026-10-31", "2026-10-31T18:00:00.000Z");
  db = ran.db;
  const saved = db.pregame.find((row) => row.playerId === "player_giannis" && row.stat === "points");
  assert.ok(saved?.projection);
  db = importBundle(db, load("actuals")).db;
  const again = applyModelRun(db, "2026-10-31", "2026-11-01T12:00:00.000Z");
  const locked = again.db.pregame.find((row) => row.playerId === "player_giannis" && row.stat === "points");
  assert.equal(locked?.projection, saved?.projection);
  assert.equal(locked?.line, saved?.line);
  assert.equal(locked?.savedAt, saved?.savedAt);
  const slate = buildSlate(again.db, "2026-10-31");
  const grade = (id: string) => slate.rows.find((row) => row.playerId === id)?.stats.points.grade;
  assert.equal(grade("player_giannis"), "win");
  assert.equal(grade("player_dame"), "push");
  assert.equal(grade("player_lopez"), "loss");
  assert.equal(grade("player_bam"), "dnp");
  assert.equal(grade("player_butler"), "ungraded");
  assert.equal(slate.rows.find((row) => row.playerId === "player_giannis")?.stats.points.source, "saved");
  assert.equal(slate.summaries.points.eligible, 2);
  assert.equal(slate.summaries.points.winRate, 0.5);
});
