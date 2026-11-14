import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const today = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/HomeworkPanel.tsx", import.meta.url), "utf8");
const homework = readFileSync(new URL("../lib/homework.ts", import.meta.url), "utf8");
const http = readFileSync(new URL("../lib/http.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("homework sits above the player list and is not a table", () => {
  const homeworkAt = today.indexOf("<HomeworkPanel");
  const listAt = today.indexOf('<div className="game-list">');
  assert.ok(homeworkAt > 0 && homeworkAt < listAt);
  assert.match(panel, /aria-label="Homework"/);
  assert.match(panel, /className="homework-delta"/);
  assert.match(panel, /className="homework-pill"/);
  assert.match(panel, /proj<\/span>/);
  assert.match(panel, /line<\/span>/);
  assert.match(panel, /className="homework-role"/);
  assert.match(panel, /className="lineup-injury"/);
  assert.match(panel, /className="homework-last"/);
  assert.match(panel, /className="homework-note"/);
  assert.doesNotMatch(panel, /<table/);
  assert.doesNotMatch(homework, /openai|fetch\(/i);
  assert.match(http, /priorGames: priorGames\(db, date\)/);
});

test("Projections and Lines ask first, and the other buttons do not", () => {
  const actions = between(today, '<div className="row actions">', "</div>");
  assert.match(actions, /askToRun\("Projections", "\/api\/projections"/);
  assert.match(actions, /askToRun\("Lines", "\/api\/consensus"/);
  assert.doesNotMatch(actions, /post\("\/api\/projections"/);
  assert.doesNotMatch(actions, /post\("\/api\/consensus"/);
  assert.match(actions, /onClick=\{\(\) => void checkLineups\(\)\}>Injury\/lineup check/);
  assert.match(actions, /post\("\/api\/research"/);

  const dialog = between(today, 'role="dialog"', "aboutOpen ? <AboutDesk");
  assert.match(dialog, /Run \{pendingRun\.label\}\?/);
  assert.match(dialog, /onClick=\{\(\) => setPendingRun\(null\)\}>Cancel/);
  assert.match(dialog, /setPendingRun\(null\)/);
  assert.match(dialog, /void post\(next\.url, \{\}, next\.pending\)/);
  assert.match(dialog, /\{pendingRun\.label\}/);
});

test("over and under prices stay in the table and are not shown", () => {
  assert.match(today, /function odds\(value: number \| null\)/);
  assert.match(today, /<th className="num odds-col">Over<\/th>/);
  assert.match(today, /<th className="num odds-col">Under<\/th>/);
  assert.match(today, /odds\(cell\.overOdds\)/);
  assert.match(today, /odds\(cell\.underOdds\)/);
  assert.match(css, /\.odds-col \{ display: none; \}/);
});

test("the Import card is off the Today page", () => {
  assert.doesNotMatch(today, /<h2>Import<\/h2>/);
  assert.doesNotMatch(today, /Import file/);
  assert.doesNotMatch(today, /CSV and JSON/);
  assert.doesNotMatch(today, /setImportText/);
});
