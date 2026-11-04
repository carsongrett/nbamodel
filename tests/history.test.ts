import assert from "node:assert/strict";
import test from "node:test";
import type { Stat } from "../lib/engine";
import {
  applyHistoryFilters,
  historyResultText,
  hitRateByLineDistance,
  matchesHistoryResult,
  type HistoryCell,
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

test("result filter defaults to every row and can select win, loss, or not saved", () => {
  const rows = slate();
  const all = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "all" });
  assert.equal(all.rows.length, rows.length);
  assert.deepEqual(all.rows.map((item) => historyResultText(item.stats.points)), [
    "Win",
    "Loss",
    "Win",
    "Push",
    "Not saved",
    "Not saved",
    "DNP",
    "No pick",
    "Unresolved",
    "Not saved",
    "Win",
    "Win",
    "Loss",
  ]);

  const wins = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "win" });
  assert.deepEqual(wins.rows.map((item) => item.stats.points.grade), ["win", "win", "win", "win"]);
  assert.ok(wins.rows.every((item) => item.stats.points.source === "saved"));

  const losses = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "loss" });
  assert.equal(losses.rows.length, 2);
  assert.ok(losses.rows.every((item) => historyResultText(item.stats.points) === "Loss"));

  const unsaved = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "not_saved" });
  assert.equal(unsaved.rows.length, 3);
  assert.ok(unsaved.rows.every((item) => historyResultText(item.stats.points) === "Not saved"));
  assert.equal(matchesHistoryResult(push, "not_saved"), false);
  assert.equal(matchesHistoryResult(push, "all"), true);
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
  assert.equal(bos.rows.length, 8);

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

test("distance groups follow the slate filters and stay empty for not saved", () => {
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

  const unsaved = applyHistoryFilters(rows, { gameId: "", teamId: "", stat: "points", result: "not_saved" });
  assert.equal(unsaved.rows.length, 3);
  assert.deepEqual(unsaved.distance, [
    { threshold: 1, wins: 0, losses: 0, hitRate: null },
    { threshold: 2, wins: 0, losses: 0, hitRate: null },
    { threshold: 3, wins: 0, losses: 0, hitRate: null },
    { threshold: 4, wins: 0, losses: 0, hitRate: null },
  ]);

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
