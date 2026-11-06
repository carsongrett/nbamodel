import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CURRENT_SEASON, buildSlate, emptyDatabase, summarize, type Actual, type Database, type Game, type PregameStat, type Stat } from "../lib/engine";
import {
  HISTORY_RESULT_OPTIONS,
  applyHistoryFilters,
  groupHistoryByGame,
  historyErrorRows,
  historyErrorWindows,
  historyResultFilter,
  historyResultText,
  historyScoreLabel,
  historySummary,
  hitRateByLineDistance,
  matchesHistoryResult,
  type HistoryCell,
  type HistoryGame,
  type HistoryRow,
} from "../lib/history";

function cell(partial: Partial<HistoryCell> & Pick<HistoryCell, "source" | "grade">): HistoryCell {
  return {
    projection: null,
    line: null,
    ...partial,
  };
}

function row(input: {
  gameId?: string;
  teamId?: string;
  points?: HistoryCell;
  rebounds?: HistoryCell;
  points_rebounds?: HistoryCell;
}): HistoryRow {
  const blank = cell({ source: "unavailable", grade: "ungraded" });
  return {
    gameId: input.gameId ?? "game_a",
    teamId: input.teamId ?? "BOS",
    stats: {
      points: input.points ?? blank,
      rebounds: input.rebounds ?? blank,
      points_rebounds: input.points_rebounds ?? blank,
    },
  };
}

const savedWin = cell({ source: "saved", grade: "win", projection: 25, line: 20 });
const savedLoss = cell({ source: "saved", grade: "loss", projection: 18, line: 20.5 });
const closeWin = cell({ source: "saved", grade: "win", projection: 10.4, line: 10 });
const push = cell({ source: "saved", grade: "push", projection: 30, line: 20 });
const previewWin = cell({ source: "preview", grade: "win", projection: 40, line: 20 });
const unavailable = cell({ source: "unavailable", grade: "ungraded" });
const dnp = cell({ source: "saved", grade: "dnp", projection: 15, line: 10 });
const noPick = cell({ source: "saved", grade: "no_pick", projection: 12, line: 12 });
const unresolved = cell({ source: "saved", grade: "unresolved", projection: 19, line: 14 });
const ungraded = cell({ source: "saved", grade: "ungraded", projection: null, line: 15 });
const threePointWin = cell({ source: "saved", grade: "win", projection: 14, line: 11 });
const underWin = cell({ source: "saved", grade: "win", projection: 9, line: 13 });
const farLoss = cell({ source: "saved", grade: "loss", projection: 8, line: 12.5 });

function slate(): HistoryRow[] {
  return [
    row({ gameId: "game_a", teamId: "BOS", points: savedWin, rebounds: savedLoss }),
    row({ gameId: "game_a", teamId: "NYK", points: savedLoss }),
    row({ gameId: "game_b", teamId: "BOS", points: closeWin }),
    row({ gameId: "game_b", teamId: "NYK", points: push }),
    row({ gameId: "game_a", teamId: "BOS", points: previewWin }),
    row({ gameId: "game_a", teamId: "BOS", points: unavailable }),
    row({ gameId: "game_a", teamId: "BOS", points: dnp }),
    row({ gameId: "game_a", teamId: "BOS", points: noPick }),
    row({ gameId: "game_a", teamId: "BOS", points: unresolved }),
    row({ gameId: "game_a", teamId: "BOS", points: ungraded }),
    row({ gameId: "game_a", teamId: "MIL", points: threePointWin }),
    row({ gameId: "game_b", teamId: "MIL", points: underWin }),
    row({ gameId: "game_a", teamId: "MIL", points: farLoss }),
  ];
}

test("result text matches the History column, including NOT SAVED", () => {
  assert.equal(historyResultText(savedWin), "Win");
  assert.equal(historyResultText(savedLoss), "Loss");
  assert.equal(historyResultText(push), "Push");
  assert.equal(historyResultText(dnp), "DNP");
  assert.equal(historyResultText(noPick), "No pick");
  assert.equal(historyResultText(unresolved), "Unresolved");
  assert.equal(historyResultText(previewWin), "Not saved");
  assert.equal(historyResultText(unavailable), "Not saved");
  assert.equal(historyResultText(ungraded), "Not saved");
});

test("result filter keeps saved rows and can select win or loss", () => {
  const rows = slate();
  assert.deepEqual(HISTORY_RESULT_OPTIONS.map((item) => item.id), ["all", "win", "loss"]);
  assert.equal(historyResultFilter("not_saved"), "all");
  assert.equal(historyResultFilter("win"), "win");

  const all = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "all" });
  assert.equal(all.rows.length, 10);
  assert.deepEqual(all.rows.map((item) => historyResultText(item.stats.points)), [
    "Win",
    "Loss",
    "Win",
    "Push",
    "DNP",
    "No pick",
    "Unresolved",
    "Win",
    "Win",
    "Loss",
  ]);
  assert.ok(all.rows.every((item) => historyResultText(item.stats.points) !== "Not saved"));

  const wins = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "win" });
  assert.deepEqual(wins.rows.map((item) => item.stats.points.grade), ["win", "win", "win", "win"]);
  assert.ok(wins.rows.every((item) => item.stats.points.source === "saved"));

  const losses = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "loss" });
  assert.equal(losses.rows.length, 2);
  assert.ok(losses.rows.every((item) => historyResultText(item.stats.points) === "Loss"));

  const ignored = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: historyResultFilter("not_saved") });
  assert.equal(ignored.rows.length, all.rows.length);
  assert.equal(matchesHistoryResult(push, "all"), true);
  assert.equal(matchesHistoryResult(previewWin, "all"), false);
  assert.equal(matchesHistoryResult(ungraded, "all"), false);
});

test("result filter follows the selected stat and does not change saved rows", () => {
  const rows = slate();
  const before = structuredClone(rows);
  const rebounds = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "rebounds", result: "loss" });
  assert.equal(rebounds.rows.length, 1);
  assert.equal(rebounds.rows[0].stats.rebounds.grade, "loss");
  assert.equal(applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "rebounds", result: "win" }).rows.length, 0);
  assert.deepEqual(rows, before);
  assert.equal(rebounds.rows[0], rows[0]);
  assert.equal(rebounds.rows[0].stats.points.line, 20);
  assert.equal(rebounds.rows[0].stats.points.grade, "win");
});

test("game and team filters narrow the table without dropping pushes from All", () => {
  const rows = slate();
  const bos = applyHistoryFilters(rows, { gameId: "", teamId: "BOS", stat: "points", result: "all" });
  assert.ok(bos.rows.every((item) => item.teamId === "BOS"));
  assert.deepEqual(bos.rows.map((item) => historyResultText(item.stats.points)), [
    "Win",
    "Win",
    "DNP",
    "No pick",
    "Unresolved",
  ]);

  const gameB = applyHistoryFilters(rows, { gameId: "game_b", teamId: "", stat: "points", result: "all" });
  assert.deepEqual(gameB.rows.map((item) => historyResultText(item.stats.points)), ["Win", "Push", "Win"]);

  const both = applyHistoryFilters(rows, { gameId: "game_b", teamId: "NYK", stat: "points", result: "all" });
  assert.equal(both.rows.length, 1);
  assert.equal(historyResultText(both.rows[0].stats.points), "Push");
});

test("distance groups count absolute projection-minus-line for wins and losses", () => {
  const groups = hitRateByLineDistance([
    savedWin,
    savedLoss,
    closeWin,
    push,
    previewWin,
    unavailable,
    dnp,
    noPick,
    unresolved,
    ungraded,
    threePointWin,
    underWin,
    farLoss,
    cell({ source: "saved", grade: "win", projection: 21, line: 20 }),
    cell({ source: "saved", grade: "loss", projection: null, line: 10 }),
    cell({ source: "saved", grade: "win", projection: 19, line: null }),
    cell({ source: "saved", grade: "win", projection: Number.NaN, line: 10 }),
  ]);
  const record = (threshold: number) => {
    const group = groups.find((item) => item.threshold === threshold);
    assert.ok(group);
    return `${group.wins}-${group.losses} ${group.hitRate}`;
  };
  assert.deepEqual(groups.map((group) => group.threshold), [1, 2, 3, 4]);
  assert.equal(record(1), `4-2 ${4 / 6}`);
  assert.equal(record(2), `3-2 ${3 / 5}`);
  assert.equal(record(3), `3-1 ${3 / 4}`);
  assert.equal(record(4), `2-1 ${2 / 3}`);
});

test("a row counts in every threshold its absolute distance clears", () => {
  const exact = hitRateByLineDistance([
    cell({ source: "saved", grade: "win", projection: 21, line: 20 }),
    cell({ source: "saved", grade: "loss", projection: 18, line: 20 }),
    cell({ source: "saved", grade: "win", projection: 17, line: 20 }),
    cell({ source: "saved", grade: "loss", projection: 10, line: 14 }),
    cell({ source: "saved", grade: "win", projection: 20.2, line: 20 }),
  ]);
  assert.deepEqual(exact.map((group) => [group.threshold, group.wins, group.losses, group.hitRate]), [
    [1, 2, 2, 0.5],
    [2, 1, 2, 1 / 3],
    [3, 1, 1, 0.5],
    [4, 0, 1, 0],
  ]);
});

test("distance groups follow the slate filters and count saved wins and losses", () => {
  const rows = slate();
  const all = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "all" });
  assert.deepEqual(all.distance.map((group) => [group.wins, group.losses]), [
    [3, 2],
    [3, 2],
    [3, 1],
    [2, 1],
  ]);
  assert.equal(all.distance[0].hitRate, 3 / 5);
  assert.equal(all.distance[3].hitRate, 2 / 3);

  const milGameA = applyHistoryFilters(rows, { gameId: "game_a", teamId: "MIL", stat: "points", result: "all" });
  assert.deepEqual(milGameA.distance.map((group) => [group.wins, group.losses, group.hitRate]), [
    [1, 1, 0.5],
    [1, 1, 0.5],
    [1, 1, 0.5],
    [0, 1, 0],
  ]);

  const winsOnly = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "win" });
  assert.ok(winsOnly.distance.every((group) => group.losses === 0));
  assert.deepEqual(winsOnly.distance.map((group) => group.wins), [3, 3, 3, 2]);

  const rebounds = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "rebounds" as Stat, result: "all" });
  assert.deepEqual(rebounds.distance.map((group) => [group.wins, group.losses, group.hitRate]), [
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, null],
    [0, 0, null],
  ]);
});

test("an empty filter still reports each distance group", () => {
  const view = applyHistoryFilters([], { gameId: "", teamId: "", stat: "points", result: "all" });
  assert.deepEqual(view.rows, []);
  assert.deepEqual(view.distance.map((group) => group.hitRate), [null, null, null, null]);
  assert.ok(view.distance.every((group) => group.wins === 0 && group.losses === 0));
});

test("summary counts saved rows and leaves not saved out", () => {
  const cells = [
    { ...savedWin, error: 5 },
    { ...savedLoss, error: -2.5 },
    { ...closeWin, error: 0.4 },
    { ...push, error: 10 },
    { ...previewWin, error: 20 },
    { ...unavailable, error: 8 },
    { ...dnp, error: 3 },
    { ...unresolved, error: 4 },
    { ...ungraded, error: 1 },
  ];
  const summary = historySummary(cells);
  const graded = cells.filter((cell) => historyResultText(cell) !== "Not saved");
  const expected = summarize(graded.map((cell) => ({ grade: cell.grade, error: cell.error ?? null })));
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 1);
  assert.equal(summary.pushes, 1);
  assert.equal(summary.wins, expected.wins);
  assert.equal(summary.losses, expected.losses);
  assert.equal(summary.pushes, expected.pushes);
  assert.equal(summary.winRate, expected.winRate);
  assert.equal(summary.meanAbsoluteError, expected.meanAbsoluteError);
  assert.equal(summary.winRate, 2 / 3);
  assert.equal(summary.vegasMeanAbsoluteError, null);
});

test("vegas abs error averages |line - actual| on the saved rows in the model error", () => {
  const cells = [
    { ...savedWin, actual: 30, error: 5 },
    { ...savedLoss, actual: 16, error: -2 },
    { ...closeWin, actual: 11, error: 0.6 },
    { ...push, actual: 20, error: -10 },
    { ...previewWin, actual: 50, error: 10 },
    { ...unavailable, actual: 8, error: 1 },
    { ...dnp, actual: 4, error: 3 },
    { ...unresolved, actual: 9, error: 4 },
    { ...noPick, actual: 14, error: 1, line: null },
    { ...savedWin, actual: 0, error: null, line: 2 },
  ];
  const summary = historySummary(cells);
  const graded = cells.filter((cell) => historyResultText(cell) !== "Not saved");
  const expected = summarize(graded.map((cell) => ({ grade: cell.grade, error: cell.error ?? null })));
  assert.equal(summary.wins, expected.wins);
  assert.equal(summary.losses, expected.losses);
  assert.equal(summary.pushes, expected.pushes);
  assert.equal(summary.winRate, expected.winRate);
  assert.equal(summary.meanAbsoluteError, expected.meanAbsoluteError);
  assert.equal(summary.wins, 3);
  assert.equal(summary.losses, 1);
  assert.equal(summary.pushes, 1);
  assert.equal(summary.winRate, 0.75);
  const model = [5, 2, 0.6, 10, 1];
  assert.equal(summary.meanAbsoluteError, model.reduce((sum, error) => sum + error, 0) / model.length);
  const vegas = [Math.abs(20 - 30), Math.abs(20.5 - 16), Math.abs(10 - 11), Math.abs(20 - 20)];
  assert.equal(summary.vegasMeanAbsoluteError, vegas.reduce((sum, error) => sum + error, 0) / vegas.length);
});

test("History labels slate, last 15 days, and all time abs error for the model and Vegas", () => {
  const source = readFileSync(new URL("../components/HistoryDesk.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/history/route.ts", import.meta.url), "utf8");
  assert.match(source, /historySummary\(\(slate\?\.rows \?\? \[\]\)\.map\(\(row\) => row\.stats\[stat\]\)\)/);
  assert.match(source, /<span>Wins<\/span><strong>\{summary\.wins\}<\/strong>/);
  assert.match(source, /<span>Losses<\/span><strong>\{summary\.losses\}<\/strong>/);
  assert.match(source, /<span>Win rate<\/span><strong>\{pct\(summary\.winRate\)\}<\/strong>/);
  assert.match(source, /<span>Pushes<\/span><strong>\{summary\.pushes\}<\/strong>/);
  assert.match(source, /fetch\(`\/api\/history\?date=\$\{date\}`\)/);
  assert.match(source, /const last15 = shownWindows\?\.\[stat\]\?\.last15/);
  assert.match(source, /const allTimeErrors = shownWindows\?\.\[stat\]\?\.allTime/);
  assert.match(source, /<span>Model abs error, slate<\/span><strong>\{fmt\(summary\.meanAbsoluteError, 2\)\}<\/strong>/);
  assert.match(source, /<span>Vegas abs error, slate<\/span><strong>\{fmt\(summary\.vegasMeanAbsoluteError, 2\)\}<\/strong>/);
  assert.match(source, /<span>Model abs error, last 15 days<\/span><strong>\{fmt\(last15\?\.meanAbsoluteError, 2\)\}<\/strong>/);
  assert.match(source, /<span>Vegas abs error, last 15 days<\/span><strong>\{fmt\(last15\?\.vegasMeanAbsoluteError, 2\)\}<\/strong>/);
  assert.match(source, /<span>Model abs error, all time<\/span><strong>\{fmt\(allTimeErrors\?\.meanAbsoluteError, 2\)\}<\/strong>/);
  assert.match(source, /<span>Vegas abs error, all time<\/span><strong>\{fmt\(allTimeErrors\?\.vegasMeanAbsoluteError, 2\)\}<\/strong>/);
  assert.doesNotMatch(source, /Mean abs\. error/);
  assert.match(route, /historyErrorRows\(db\)/);
  assert.match(route, /historyErrorWindowsByStat\(/);
  assert.match(route, /Date must be YYYY-MM-DD/);
  const today = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
  const bets = readFileSync(new URL("../components/BetDesk.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(today, /abs error/);
  assert.doesNotMatch(bets, /abs error/);
});

function day(iso: string, delta: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  return shifted.toISOString().slice(0, 10);
}

function savedStat(input: {
  playerId: string;
  gameId: string;
  stat: Stat;
  date: string;
  projection: number | null;
  line: number | null;
}): PregameStat {
  return {
    playerId: input.playerId,
    gameId: input.gameId,
    stat: input.stat,
    slateDate: input.date,
    baseline: input.projection,
    projection: input.projection,
    minutes: 30,
    adjustments: [],
    flags: [],
    line: input.line,
    overOdds: -110,
    underOdds: -110,
    savedAt: `${input.date}T15:00:00.000Z`,
    sourcesUsed: ["sportsline"],
  };
}

test("abs error windows use the slate rows, then last 15 days and all time for that stat", () => {
  const end = "2026-11-05";
  const inside = day(end, -14);
  const outside = day(end, -15);
  const after = day(end, 1);
  assert.equal(inside, "2026-10-22");
  assert.equal(outside, "2026-10-21");
  assert.equal(after, "2026-11-06");

  const finalGame = (date: string): Game => ({
    gameId: `${date}|BOS@NYK`,
    season: CURRENT_SEASON,
    gameDate: date,
    homeTeamId: "NYK",
    awayTeamId: "BOS",
    status: "final",
  });
  const openGame: Game = {
    gameId: `${end}|MIL@MIA`,
    season: CURRENT_SEASON,
    gameDate: end,
    homeTeamId: "MIA",
    awayTeamId: "MIL",
    status: "scheduled",
  };
  const actual = (playerId: string, gameId: string, points: number | null, rebounds: number | null, dnp = false): Actual => ({
    playerId,
    gameId,
    season: CURRENT_SEASON,
    dnp,
    points,
    rebounds,
    sourceTimestamp: end,
  });
  const counted = {
    playerId: "player_count",
    projection: 22,
    line: 19.5,
    points: 27,
    rebounds: 8,
  };
  const noLine = { playerId: "player_noline", projection: 11, line: null, points: 13, rebounds: 4 };
  const noPick = { playerId: "player_nopick", projection: 12, line: 12, points: 14, rebounds: 5 };
  const earlier = { playerId: "player_earlier", projection: 10, line: 12, points: 11, rebounds: 3 };
  const older = { playerId: "player_older", projection: 30, line: 20, points: 10, rebounds: 6 };
  const later = { playerId: "player_later", projection: 8, line: 9, points: 8, rebounds: 2 };
  const db: Database = {
    ...emptyDatabase(),
    teams: [
      { teamId: "BOS", name: "Boston" },
      { teamId: "NYK", name: "New York" },
      { teamId: "MIL", name: "Milwaukee" },
      { teamId: "MIA", name: "Miami" },
    ],
    players: [
      { playerId: counted.playerId, displayName: "Counted", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: noLine.playerId, displayName: "No Line", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: noPick.playerId, displayName: "No Pick", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: "player_dnp", displayName: "Did Not Play", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: "player_missing", displayName: "No Actual", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: earlier.playerId, displayName: "Earlier", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: older.playerId, displayName: "Older", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: later.playerId, displayName: "Later", teamId: "BOS", position: "SF", season: CURRENT_SEASON },
      { playerId: "player_open", displayName: "Open", teamId: "MIL", position: "SF", season: CURRENT_SEASON },
    ],
    games: [finalGame(end), openGame, finalGame(inside), finalGame(outside), finalGame(after)],
    pregame: [
      savedStat({ playerId: counted.playerId, gameId: finalGame(end).gameId, stat: "points", date: end, projection: counted.projection, line: counted.line }),
      savedStat({ playerId: counted.playerId, gameId: finalGame(end).gameId, stat: "rebounds", date: end, projection: 6, line: 7 }),
      savedStat({ playerId: counted.playerId, gameId: finalGame(end).gameId, stat: "points_rebounds", date: end, projection: 28, line: 26 }),
      savedStat({ playerId: noLine.playerId, gameId: finalGame(end).gameId, stat: "points", date: end, projection: noLine.projection, line: noLine.line }),
      savedStat({ playerId: noPick.playerId, gameId: finalGame(end).gameId, stat: "points", date: end, projection: noPick.projection, line: noPick.line }),
      savedStat({ playerId: "player_dnp", gameId: finalGame(end).gameId, stat: "points", date: end, projection: 15, line: 14 }),
      savedStat({ playerId: "player_missing", gameId: finalGame(end).gameId, stat: "points", date: end, projection: 18, line: 16 }),
      savedStat({ playerId: earlier.playerId, gameId: finalGame(inside).gameId, stat: "points", date: inside, projection: earlier.projection, line: earlier.line }),
      savedStat({ playerId: older.playerId, gameId: finalGame(outside).gameId, stat: "points", date: outside, projection: older.projection, line: older.line }),
      savedStat({ playerId: later.playerId, gameId: finalGame(after).gameId, stat: "points", date: after, projection: later.projection, line: later.line }),
      savedStat({ playerId: "player_open", gameId: openGame.gameId, stat: "points", date: end, projection: 30, line: 28 }),
    ],
    actuals: [
      actual(counted.playerId, finalGame(end).gameId, counted.points, counted.rebounds),
      actual(noLine.playerId, finalGame(end).gameId, noLine.points, noLine.rebounds),
      actual(noPick.playerId, finalGame(end).gameId, noPick.points, noPick.rebounds),
      actual("player_dnp", finalGame(end).gameId, null, null, true),
      actual(earlier.playerId, finalGame(inside).gameId, earlier.points, earlier.rebounds),
      actual(older.playerId, finalGame(outside).gameId, older.points, older.rebounds),
      actual(later.playerId, finalGame(after).gameId, later.points, later.rebounds),
    ],
  };

  const rows = historyErrorRows(db);
  const points = historyErrorWindows(rows, "points", end);
  const slateCells = rows.filter((row) => row.stat === "points" && row.date === end);
  const slateSummary = historySummary(slateCells);
  const slateModel = [Math.abs(counted.projection - counted.points), Math.abs(noPick.projection - noPick.points)];
  const slateVegas = [Math.abs(counted.line - counted.points), Math.abs(noPick.line - noPick.points)];
  assert.equal(slateSummary.meanAbsoluteError, slateModel.reduce((sum, error) => sum + error, 0) / slateModel.length);
  assert.equal(slateSummary.vegasMeanAbsoluteError, slateVegas.reduce((sum, error) => sum + error, 0) / slateVegas.length);
  assert.equal(slateSummary.wins, 1);

  const board = buildSlate(db, end);
  const onSlate = historySummary(board.rows.map((row) => row.stats.points));
  assert.equal(onSlate.meanAbsoluteError, slateSummary.meanAbsoluteError);
  assert.equal(onSlate.vegasMeanAbsoluteError, slateSummary.vegasMeanAbsoluteError);
  assert.equal(onSlate.wins, slateSummary.wins);
  assert.equal(onSlate.losses, slateSummary.losses);
  assert.equal(onSlate.pushes, slateSummary.pushes);

  const last15Model = [...slateModel, Math.abs(earlier.projection - earlier.points)];
  const last15Vegas = [...slateVegas, Math.abs(earlier.line - earlier.points)];
  assert.equal(points.last15.meanAbsoluteError, last15Model.reduce((sum, error) => sum + error, 0) / last15Model.length);
  assert.equal(points.last15.vegasMeanAbsoluteError, last15Vegas.reduce((sum, error) => sum + error, 0) / last15Vegas.length);

  const allModel = [...last15Model, Math.abs(older.projection - older.points), Math.abs(later.projection - later.points)];
  const allVegas = [...last15Vegas, Math.abs(older.line - older.points), Math.abs(later.line - later.points)];
  assert.equal(points.allTime.meanAbsoluteError, allModel.reduce((sum, error) => sum + error, 0) / allModel.length);
  assert.equal(points.allTime.vegasMeanAbsoluteError, allVegas.reduce((sum, error) => sum + error, 0) / allVegas.length);

  const rebounds = historyErrorWindows(rows, "rebounds", end);
  assert.equal(rebounds.last15.meanAbsoluteError, Math.abs(6 - counted.rebounds));
  assert.equal(rebounds.last15.vegasMeanAbsoluteError, Math.abs(7 - counted.rebounds));
  assert.equal(rebounds.allTime.meanAbsoluteError, rebounds.last15.meanAbsoluteError);
  assert.equal(rebounds.allTime.vegasMeanAbsoluteError, rebounds.last15.vegasMeanAbsoluteError);

  const combined = historyErrorWindows(rows, "points_rebounds", end);
  const combinedActual = counted.points + counted.rebounds;
  assert.equal(combined.last15.meanAbsoluteError, Math.abs(28 - combinedActual));
  assert.equal(combined.allTime.vegasMeanAbsoluteError, Math.abs(26 - combinedActual));

  const quiet = historyErrorWindows([], "points", end);
  assert.equal(quiet.last15.meanAbsoluteError, null);
  assert.equal(quiet.last15.vegasMeanAbsoluteError, null);
  assert.equal(quiet.allTime.meanAbsoluteError, null);
  assert.equal(quiet.allTime.vegasMeanAbsoluteError, null);
});

function game(partial: Partial<HistoryGame> & Pick<HistoryGame, "gameId" | "label">): HistoryGame {
  return {
    status: "final",
    homeTeamId: "WAS",
    awayTeamId: "ATL",
    spread: null,
    total: null,
    tipAt: null,
    tipLabel: null,
    ...partial,
  };
}

test("final score uses a stored score and stays blank without one", () => {
  assert.equal(historyScoreLabel(game({
    gameId: "g",
    label: "ATL at WAS",
    awayTeamId: "ATL",
    homeTeamId: "WAS",
    awayScore: 110,
    homeScore: 104,
  })), "ATL 110, WAS 104");
  assert.equal(historyScoreLabel(game({
    gameId: "g",
    label: "ATL at WAS",
    status: "scheduled",
    awayScore: 110,
    homeScore: 104,
  })), null);
  assert.equal(historyScoreLabel(game({
    gameId: "g",
    label: "ATL at WAS",
    status: "in_progress",
    awayScore: 80,
    homeScore: 77,
  })), null);
  assert.equal(historyScoreLabel(game({
    gameId: "g",
    label: "ATL at WAS",
    awayScore: 110,
  })), null);
  assert.equal(historyScoreLabel(game({
    gameId: "g",
    label: "ATL at WAS",
    awayScore: null,
    homeScore: null,
  })), null);
});

test("history groups saved players by the same tip order as Today", () => {
  const db = emptyDatabase();
  db.games.push(
    { gameId: "2026-11-04|ATL@WAS", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "WAS", awayTeamId: "ATL", status: "final", tipAt: "2026-11-05T02:00:00Z" },
    { gameId: "2026-11-04|CHA@BKN", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "BKN", awayTeamId: "CHA", status: "final", tipAt: "2026-11-05T00:00:00Z" },
    { gameId: "2026-11-04|DEN@LAL", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "LAL", awayTeamId: "DEN", status: "scheduled", tipAt: "2026-11-04T23:30:00Z" },
    { gameId: "2026-11-04|MIA@BOS", season: CURRENT_SEASON, gameDate: "2026-11-04", homeTeamId: "BOS", awayTeamId: "MIA", status: "in_progress" },
  );
  const slateView = buildSlate(db, "2026-11-04");
  const rows = [
    row({ gameId: "2026-11-04|ATL@WAS", teamId: "ATL", points: savedWin }),
    row({ gameId: "2026-11-04|ATL@WAS", teamId: "WAS", points: savedLoss }),
    row({ gameId: "2026-11-04|CHA@BKN", teamId: "CHA", points: previewWin }),
    row({ gameId: "2026-11-04|DEN@LAL", teamId: "DEN", points: push }),
    row({ gameId: "2026-11-04|MIA@BOS", teamId: "MIA", points: dnp }),
    { ...row({ gameId: "missing", teamId: "ORL", points: noPick }), gameLabel: "ORL at PHI" },
  ];
  const before = structuredClone(rows);
  const view = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "all" });
  const order = slateView.games.map((game) => game.gameId);
  const groups = groupHistoryByGame(view.rows, slateView.games);
  assert.deepEqual(groups.map((group) => group.game.gameId), [
    "2026-11-04|DEN@LAL",
    "2026-11-04|ATL@WAS",
    "2026-11-04|MIA@BOS",
    "missing",
  ]);
  assert.deepEqual(order.slice(0, 3), [
    "2026-11-04|DEN@LAL",
    "2026-11-04|CHA@BKN",
    "2026-11-04|ATL@WAS",
  ]);
  assert.deepEqual(groups[0].rows.map((item) => item.teamId), ["DEN"]);
  assert.deepEqual(groups[1].rows.map((item) => item.teamId), ["ATL", "WAS"]);
  assert.equal(groups[0].game.tipLabel, "5:30 PM CT");
  assert.equal(groups[0].scoreLabel, null);
  assert.equal(groups[1].scoreLabel, null);
  assert.equal(groups[2].game.tipLabel, null);
  assert.equal(groups[2].scoreLabel, null);
  assert.equal(groups[3].game.label, "ORL at PHI");
  assert.equal(groups[3].scoreLabel, null);
  assert.ok(groups.every((group) => group.rows.length > 0));
  assert.equal(groups.some((group) => group.game.gameId === "2026-11-04|CHA@BKN"), false);
  assert.deepEqual(rows, before);

  const withScore = slateView.games.map((item) => item.gameId === "2026-11-04|ATL@WAS"
    ? { ...item, awayScore: 110, homeScore: 104 }
    : item);
  const scored = groupHistoryByGame(view.rows, withScore);
  assert.equal(scored[1].scoreLabel, "ATL 110, WAS 104");
  assert.equal(scored[0].scoreLabel, null);
  assert.equal(historyScoreLabel({ ...groups[0].game, status: "scheduled", awayScore: 110, homeScore: 104 }), null);
});
