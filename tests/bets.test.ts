import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { betLists, betPlayers, betProfit, betsFromDatabase, betTracking, betWindowRecords, betWindowTotals, formatRecord, formatStake, formatUnits } from "../lib/bets.ts";
import { applyModelRun, buildSlate, CURRENT_SEASON, emptyDatabase, importRecords, setBetUnits, setPropLine, type Player } from "../lib/engine.ts";
import { applyBettingProsProbe } from "../lib/sources/apply-bettingpros.ts";
import type { ProbeResult } from "../lib/sources/bettingpros.ts";

const today = "2026-11-05";
const retrievedAt = "2026-11-05T18:00:00Z";

function day(iso: string, delta: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  return shifted.toISOString().slice(0, 10);
}

test("even money pays the units, costs the units, or pushes at zero", () => {
  assert.equal(betProfit(2, "win"), 2);
  assert.equal(betProfit(1.5, "loss"), -1.5);
  assert.equal(betProfit(3, "push"), 0);
  assert.equal(betProfit(4, "unresolved"), null);
  assert.equal(betProfit(4, "dnp"), null);
  assert.equal(betProfit(4, "no_pick"), null);
  assert.equal(betProfit(4, "ungraded"), null);
  assert.equal(betProfit(0, "win"), null);
  assert.equal(betProfit(-2, "win"), null);
});

test("windows are units up or down and leave out unsettled bets", () => {
  assert.equal(day(today, -6), "2026-10-30");
  assert.equal(day(today, -7), "2026-10-29");
  assert.equal(day(today, -29), "2026-10-07");
  assert.equal(day(today, -30), "2026-10-06");
  const totals = betWindowTotals([
    { slateDate: today, units: 2, grade: "win" },
    { slateDate: today, units: 5, grade: "push" },
    { slateDate: today, units: 9, grade: "unresolved" },
    { slateDate: today, units: 8, grade: "dnp" },
    { slateDate: day(today, -6), units: 1, grade: "loss" },
    { slateDate: day(today, -7), units: 1, grade: "loss" },
    { slateDate: day(today, -40), units: 4, grade: "win" },
  ], today);
  assert.equal(totals.today, 2);
  assert.equal(totals.last7, 1);
  assert.equal(totals.last30, 0);
  assert.equal(totals.allTime, 4);
  assert.equal(formatUnits(totals.today), "+2");
  assert.equal(formatUnits(-1.5), "−1.5");
  assert.equal(formatUnits(0), "0");
  assert.equal(formatStake(1.5), "1.5");
  const records = betWindowRecords([
    { slateDate: today, units: 2, grade: "win" },
    { slateDate: today, units: 5, grade: "push" },
    { slateDate: today, units: 9, grade: "unresolved" },
    { slateDate: today, units: 8, grade: "dnp" },
    { slateDate: day(today, -6), units: 1, grade: "loss" },
    { slateDate: day(today, -7), units: 1, grade: "loss" },
    { slateDate: day(today, -40), units: 4, grade: "win" },
  ], today);
  assert.deepEqual(records.today, { wins: 1, losses: 0 });
  assert.deepEqual(records.last7, { wins: 1, losses: 1 });
  assert.deepEqual(records.last30, { wins: 1, losses: 2 });
  assert.deepEqual(records.allTime, { wins: 2, losses: 2 });
  assert.equal(formatRecord(2, 1), "2–1");
  assert.equal(totals.today, 2);
});

test("settled bets list the player and result, and pending bets stay separate", () => {
  const lists = betLists([
    { slateDate: today, units: 2, grade: "win", playerName: "Devin Booker" },
    { slateDate: day(today, -1), units: 1, grade: "loss", playerName: "Kevin Durant" },
    { slateDate: today, units: 3, grade: "push", playerName: "Bam Adebayo" },
    { slateDate: today, units: 4, grade: "unresolved", playerName: "Jalen Brunson" },
    { slateDate: today, units: 5, grade: "dnp", playerName: "Out Player" },
  ]);
  assert.deepEqual(lists.settled, [
    { playerName: "Bam Adebayo", units: 3, result: "Push" },
    { playerName: "Devin Booker", units: 2, result: "Win" },
    { playerName: "Kevin Durant", units: 1, result: "Loss" },
  ]);
  assert.deepEqual(lists.pending, [{ playerName: "Jalen Brunson", units: 4 }]);
});

test("a bet with no actual is pending and is left out of the units", () => {
  const db = emptyDatabase();
  db.players = [
    { playerId: "book", displayName: "Devin Booker", teamId: "PHX", position: "SG", season: CURRENT_SEASON },
    { playerId: "kd", displayName: "Kevin Durant", teamId: "PHX", position: "SF", season: CURRENT_SEASON },
  ];
  db.games = [
    { gameId: "final", season: CURRENT_SEASON, gameDate: today, homeTeamId: "PHX", awayTeamId: "ORL", status: "final" },
    { gameId: "later", season: CURRENT_SEASON, gameDate: today, homeTeamId: "PHX", awayTeamId: "LAL", status: "scheduled" },
  ];
  const saved = (playerId: string, gameId: string, projection: number, line: number, units: number) => ({
    playerId,
    gameId,
    stat: "points" as const,
    slateDate: today,
    baseline: projection,
    projection,
    minutes: 34,
    adjustments: [],
    flags: [],
    line,
    overOdds: null,
    underOdds: null,
    units,
    savedAt: retrievedAt,
    sourcesUsed: ["sportsline"],
  });
  db.pregame = [saved("book", "final", 28, 24.5, 2), saved("kd", "later", 27, 25.5, 1.5)];
  db.actuals = [{
    playerId: "book",
    gameId: "final",
    season: CURRENT_SEASON,
    dnp: false,
    points: 30,
    rebounds: 4,
    sourceTimestamp: retrievedAt,
  }];
  const view = betTracking(db, today);
  assert.equal(view.today, 2);
  assert.equal(view.last7, 2);
  assert.equal(view.allTime, 2);
  assert.deepEqual(view.records.today, { wins: 1, losses: 0 });
  assert.equal(formatRecord(view.records.allTime.wins, view.records.allTime.losses), "1–0");
  assert.deepEqual(view.settled, [{ playerName: "Devin Booker", units: 2, result: "Win" }]);
  assert.deepEqual(view.pending, [{ playerName: "Kevin Durant", units: 1.5 }]);
});

function desk(): { db: ReturnType<typeof emptyDatabase>; player: Player; gameId: string } {
  const gameId = "2026-11-05|TOR@LAL";
  const player: Player = { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON };
  const db = {
    ...emptyDatabase(),
    players: [player],
    games: [{ gameId, season: CURRENT_SEASON, gameDate: today, homeTeamId: "LAL", awayTeamId: "TOR", status: "scheduled" as const }],
    projections: [{
      playerId: player.playerId,
      gameId,
      source: "sportsline",
      season: CURRENT_SEASON,
      points: 32,
      rebounds: 8,
      minutes: 36,
      sourceTimestamp: retrievedAt,
    }],
  };
  return { db, player, gameId };
}

test("a bet requires a line and a side, then stays on the line and the saved row", () => {
  const { db, player, gameId } = desk();
  const missing = setBetUnits(db, player.playerId, gameId, "points", 2, retrievedAt);
  assert.equal(missing.error, "A line is required before a bet is saved.");
  assert.equal(missing.db.lines.length, 0);

  const typed = setPropLine(db, player.playerId, gameId, "points", 24.5, retrievedAt);
  assert.equal(typed.stored, true);
  const negative = setBetUnits(typed.db, player.playerId, gameId, "points", -1, retrievedAt);
  assert.equal(negative.error, "Units must be a positive number.");
  const zero = setBetUnits(typed.db, player.playerId, gameId, "points", 0, retrievedAt);
  assert.equal(zero.error, "Units must be a positive number.");

  const bet = setBetUnits(typed.db, player.playerId, gameId, "points", 2, retrievedAt);
  assert.equal(bet.error, undefined);
  assert.equal(bet.db.lines[0]?.units, 2);
  assert.equal(bet.db.pregame[0]?.units, 2);
  const board = buildSlate(bet.db, today);
  assert.equal(board.rows[0]?.stats.points.units, 2);

  const cleared = setBetUnits(bet.db, player.playerId, gameId, "points", null, retrievedAt);
  assert.equal(cleared.db.lines[0]?.line, 24.5);
  assert.equal(cleared.db.lines[0]?.units ?? null, null);
  assert.equal(cleared.db.pregame[0]?.units ?? null, null);

  const again = setBetUnits(cleared.db, player.playerId, gameId, "points", 1.5, retrievedAt);
  const ran = applyModelRun(again.db, today, retrievedAt);
  assert.equal(ran.db.lines[0]?.units, 1.5);
  assert.equal(ran.db.pregame.find((row) => row.stat === "points")?.units, 1.5);

  const imported = importRecords(ran.db, "lines", [{
    rowNumber: 2,
    values: { player_id: player.playerId, game_id: gameId, season: CURRENT_SEASON, stat: "points", line: "26.5" },
  }]);
  assert.equal(imported.db.lines.find((row) => row.stat === "points")?.units, 1.5);

  const probe: ProbeResult = {
    state: "parsed",
    message: "ok",
    calls: [],
    events: [{ id: "10", home: "LAL", away: "TOR" }],
    offers: [{ eventId: "10", playerId: "55", name: "Luka Doncic", marketId: 156, line: 22.5, overOdds: -110, underOdds: -105 }],
    furtherPages: 0,
  };
  const loaded = applyBettingProsProbe(imported.db, today, probe, retrievedAt);
  assert.equal(loaded.db.lines.find((row) => row.stat === "points")?.line, 22.5);
  assert.equal(loaded.db.lines.find((row) => row.stat === "points")?.units, 1.5);
  const refreshed = applyModelRun(loaded.db, today, retrievedAt);
  assert.equal(refreshed.db.pregame.find((row) => row.stat === "points")?.units, 1.5);

  const locked = {
    ...refreshed.db,
    actuals: [{
      playerId: player.playerId,
      gameId,
      season: CURRENT_SEASON,
      dnp: false,
      points: 30,
      rebounds: 8,
      sourceTimestamp: retrievedAt,
    }],
    games: refreshed.db.games.map((game) => ({ ...game, status: "final" as const })),
  };
  const refused = setBetUnits(locked, player.playerId, gameId, "points", 4, retrievedAt);
  assert.equal(refused.error, "Results are already stored. The bet was not changed.");
  assert.equal(refused.db.pregame[0]?.units, 1.5);
  const settled = betsFromDatabase(locked);
  assert.equal(settled.length, 1);
  assert.equal(settled[0]?.grade, "win");
  assert.equal(betWindowTotals(settled, today).today, 1.5);
});

test("a projection on the line is not a bet", () => {
  const { db, player, gameId } = desk();
  const flat = {
    ...db,
    projections: db.projections.map((row) => ({ ...row, points: 20 })),
  };
  const typed = setPropLine(flat, player.playerId, gameId, "points", 20, retrievedAt);
  assert.equal(typed.stored, true);
  assert.equal(typed.db.pregame[0]?.projection, 20);
  const refused = setBetUnits(typed.db, player.playerId, gameId, "points", 1, retrievedAt);
  assert.equal(refused.error, "The projection has to be above or below the line.");
  assert.equal(refused.db.lines[0]?.units ?? null, null);
});

test("history lists only settled bets", () => {
  const rows = [
    { playerId: "a", gameId: "g", playerName: "Luka Doncic", stats: { points: { source: "saved", units: 2, grade: "win" as const }, rebounds: { source: "saved", units: null, grade: "loss" as const }, points_rebounds: { source: "saved", units: null, grade: "push" as const } } },
    { playerId: "b", gameId: "g", playerName: "Austin Reaves", stats: { points: { source: "saved", units: 1, grade: "unresolved" as const }, rebounds: { source: "saved", units: null, grade: "win" as const }, points_rebounds: { source: "saved", units: null, grade: "win" as const } } },
    { playerId: "c", gameId: "g", playerName: "No Bet", stats: { points: { source: "saved", units: null, grade: "win" as const }, rebounds: { source: "saved", units: null, grade: "win" as const }, points_rebounds: { source: "saved", units: null, grade: "win" as const } } },
  ];
  assert.deepEqual(betPlayers(rows, "points"), [
    { playerId: "a", gameId: "g", playerName: "Luka Doncic", units: 2, result: "Win" },
  ]);
});

test("the desk drops the opponent column and adds bet tracking", () => {
  const todayBoard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  const history = readFileSync(new URL("../components/HistoryDesk.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/DeskNav.tsx", import.meta.url), "utf8");
  const bets = readFileSync(new URL("../components/BetDesk.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(todayBoard, /<th>Opp<\/th>/);
  assert.doesNotMatch(history, /<th>Opp<\/th>/);
  assert.match(todayBoard, /<th className="num">Bet<\/th>/);
  assert.match(todayBoard, /aria-label=\{`\$\{row\.playerName\} \$\{stat\} bet`\}/);
  const betField = todayBoard.slice(todayBoard.indexOf("${stat} bet"));
  const betInput = betField.slice(0, betField.indexOf("/>"));
  assert.match(betInput, /disabled=\{busy\}/);
  assert.doesNotMatch(betInput, /cell\.line/);
  assert.match(history, /<h2>Bet players<\/h2>/);
  assert.match(history, /<th className="num">Units<\/th>/);
  assert.match(nav, /href="\/bets"/);
  assert.match(nav, /Bet tracking/);
  assert.match(bets, /Last 7 days/);
  assert.match(bets, /Last 30 days/);
  assert.match(bets, /All time/);
  assert.match(bets, /className="bet-record"/);
  assert.match(bets, /aria-label="Settled bets"/);
  assert.match(bets, /aria-label="Pending bets"/);
  assert.match(bets, /<th>Player<\/th>/);
  assert.match(bets, /<th className="num">Units<\/th>/);
  assert.doesNotMatch(bets, /<svg|chart/i);
});
