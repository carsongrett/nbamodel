import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const history = readFileSync(new URL("../components/HistoryDesk.tsx", import.meta.url), "utf8");
const today = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("History game heading toggles player rows the way Today does", () => {
  const todayGame = between(today, '<div className="game-list">', "Highest deltas");
  assert.match(todayGame, /<details className="game" key=\{game\.gameId\}>/);
  assert.match(todayGame, /<summary>/);
  assert.doesNotMatch(todayGame, /<details[^>]*\sopen[\s=>]/);

  const historyGame = between(history, '<div className="game-list">', "</details>");
  assert.match(historyGame, /<details className="game" key=\{game\.gameId\}>/);
  assert.match(historyGame, /<summary className="game-head">/);
  assert.match(historyGame, /\{game\.label\}/);
  assert.match(historyGame, /\{game\.tipLabel \?/);
  assert.match(historyGame, /\{scoreLabel \?/);
  assert.match(historyGame, /<table>/);
  assert.doesNotMatch(historyGame, /<details[^>]*\sopen[\s=>]/);
  assert.doesNotMatch(historyGame, /<h2 className="game-head">/);

  const summary = between(historyGame, "<summary", "</summary>");
  const players = historyGame.slice(historyGame.indexOf("</summary>"));
  assert.match(players, /<table>/);
  assert.doesNotMatch(summary, /<table>/);
  assert.match(historyGame, /<th>Player<\/th>/);
  assert.match(historyGame, /<th>Team<\/th>/);
  assert.doesNotMatch(historyGame, /<th>Opp<\/th>/);
  assert.match(historyGame, /<th className="num">Units<\/th>/);
  assert.match(historyGame, /<th className="num">Projection<\/th>/);
  assert.match(historyGame, /<th className="num">Line<\/th>/);
  assert.match(historyGame, /<th className="num">Actual<\/th>/);
  assert.match(historyGame, /<th className="num">Error<\/th>/);
  assert.match(historyGame, /<th>Result<\/th>/);
});

test("Adjustment settings starts closed and uses the game toggle", () => {
  const panel = between(today, "<h2>Research</h2>", "<h2>Import</h2>");
  assert.match(panel, /<details className="game">/);
  assert.match(panel, /<summary>/);
  assert.match(panel, /<span className="player">Adjustment settings<\/span>/);
  assert.doesNotMatch(panel, /<details[^>]*\sopen[\s=>]/);
  assert.doesNotMatch(panel, /<h2>Adjustment settings<\/h2>/);
  assert.match(panel, /<form className="settings"/);
  assert.match(panel, /SETTING_FIELDS\.map/);
  assert.match(panel, /Save settings/);
  assert.match(today, /label: "DvP points"/);
  assert.match(today, /label: "Minimum rate-sample games"/);
});

test("History keeps the player name and position and hides the id", () => {
  const cell = between(history, '<div className="player">{row.playerName}</div>', "</td>");
  assert.match(cell, /<div className="meta">\{row\.position\}<\/div>/);
  assert.doesNotMatch(cell, /row\.playerId/);
  assert.doesNotMatch(cell, /·/);
});
