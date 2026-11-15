import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const today = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const projectionsRoute = readFileSync(new URL("../app/api/projections/route.ts", import.meta.url), "utf8");
const linesRoute = readFileSync(new URL("../app/api/consensus/route.ts", import.meta.url), "utf8");
const settingsRoute = readFileSync(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");
const betsRoute = readFileSync(new URL("../app/api/bets/route.ts", import.meta.url), "utf8");
const lineupsRoute = readFileSync(new URL("../app/api/lineups/route.ts", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../lib/store.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/HomeworkPanel.tsx", import.meta.url), "utf8");
const homework = readFileSync(new URL("../lib/homework.ts", import.meta.url), "utf8");
const http = readFileSync(new URL("../lib/http.ts", import.meta.url), "utf8");
const engine = readFileSync(new URL("../lib/engine.ts", import.meta.url), "utf8");
const trace = readFileSync(new URL("../components/Trace.tsx", import.meta.url), "utf8");

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
  assert.match(panel, /<h2>Biggest deltas today<\/h2>/);
  assert.match(today, /!row\.stats\[stat\]\.blockReason/);
  assert.match(homework, /if \(row\.blocked\) continue/);
  assert.match(homework, /blocked: Boolean\(row\.stats\[stat\]\.blockReason\)/);
  assert.match(panel, /<strong className="homework-team">\{row\.teamId\}<\/strong> vs \{row\.opponentId\}/);
  assert.match(css, /\.homework-team \{ font-weight: 700; \}/);
  assert.doesNotMatch(panel, /<h2>Homework<\/h2>/);
  assert.match(panel, /className="homework-delta"/);
  assert.match(panel, /className="homework-pill"/);
  assert.match(panel, /proj<\/span>/);
  assert.match(panel, /line<\/span>/);
  assert.match(panel, /className="homework-market"/);
  assert.match(panel, /Total \$\{numberText\(row\.total\)\}/);
  assert.match(panel, /aria-label=\{`\$\{row\.playerName\} \$\{row\.stat\} bet`\}/);
  assert.match(panel, /Lineup not checked/);
  assert.match(panel, /The injury check has not been run this visit/);
  assert.match(panel, /Starting · confirmed/);
  assert.match(panel, /\$\{player\.name\} · \$\{player\.position\} · \$\{role\}/);
  assert.match(panel, /player\.position \?/);
  assert.match(panel, /className="lineup-injury"/);
  assert.doesNotMatch(panel, /className="homework-role"/);
  assert.match(panel, /className="homework-last"/);
  assert.match(panel, /row\.last5\.split\(" · "\)/);
  assert.match(css, /\.homework-last \{ display: grid; \}/);
  assert.match(css, /\.homework-last > span \{ display: block; \}/);
  assert.match(panel, /className="homework-note"/);
  assert.ok(panel.indexOf("homework-last") < panel.indexOf("homework-note"));
  assert.doesNotMatch(panel, /row\.note/);
  assert.doesNotMatch(today, /homeworkStories/);
  assert.doesNotMatch(panel, /<table/);
  assert.doesNotMatch(homework, /openai|fetch\(/i);
  assert.doesNotMatch(projectionsRoute, /requestHomeworkStories/);
  assert.doesNotMatch(projectionsRoute, /homework-story/);
  assert.match(http, /priorGames: priorGames\(db, date\)/);
});

test("a homework row opens the same formula lines, and a second click or close hides them", () => {
  assert.match(panel, /setOpenKey\(open \? null : key\)/);
  assert.match(panel, /aria-expanded=\{open\}/);
  assert.match(panel, />Close</);
  assert.match(panel, /<Trace stat=\{row\.cell\} locked=\{row\.locked\} bare \/>/);
  assert.doesNotMatch(panel, /<details/);
  assert.doesNotMatch(panel, /<summary/);
  assert.match(today, /cell: source\.stats\[item\.stat\]/);
  assert.match(today, /locked: source\.locked/);
  assert.match(trace, /label="SL projection"/);
  assert.match(trace, /label="Dimers"/);
  assert.match(trace, /label="65\/35 blend"/);
  assert.match(trace, /bothSources \? null : dimers\.detail/);
  assert.match(trace, /bothSources \? <Step label="65\/35 blend"/);
  assert.match(trace, /if \(bare\) return body/);
  assert.match(trace, /<summary>Projection trace<\/summary>/);
  assert.match(css, /\.trace-body \{[^}]*width: 280px;/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto;/);
});

test("Projections and Lines ask first, and the other buttons do not", () => {
  const actions = between(today, '<div className="row actions">', "</div>");
  assert.match(actions, /askToRun\("Projections", "\/api\/projections"/);
  assert.match(actions, /askToRun\("Lines", "\/api\/consensus"/);
  assert.doesNotMatch(actions, /post\("\/api\/projections"/);
  assert.doesNotMatch(actions, /post\("\/api\/consensus"/);
  assert.match(actions, /className="primary" type="button" disabled=\{busy\} onClick=\{\(\) => askToRun\("Projections"/);
  assert.match(actions, /className="primary" type="button" disabled=\{busy\} onClick=\{\(\) => askToRun\("Lines"/);
  assert.match(actions, /className="primary" type="button" disabled=\{busy\} onClick=\{\(\) => void checkLineups\(\)\}>Injury\/lineup check/);
  assert.doesNotMatch(actions, /secondary/);
  assert.doesNotMatch(actions, /Research Slate/);
  assert.doesNotMatch(actions, /\/api\/research/);

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

test("the status line names Projections or Lines, never a player count", () => {
  const spot = between(today, '<section className="status"', "<HomeworkPanel");
  assert.doesNotMatch(spot, /Showing/);
  assert.doesNotMatch(spot, /players/);
  assert.doesNotMatch(today, /players on the board labeled/);
  assert.doesNotMatch(today, /No \$\{initialDate\} players stored/);
  assert.match(today, /runClock\(\{ running, projectionsAt, linesAt \}\)/);
  assert.doesNotMatch(today, /formatUpdated\(/);
  assert.match(engine, /updatedAt: slateSavedAt\(db, date\)/);
  assert.match(today, /useState<Date \| null>\(clockInstant\(initialProjectionsAt\)\)/);
  assert.match(today, /useState<Date \| null>\(clockInstant\(initialLinesAt\)\)/);
  assert.match(today, /setProjectionsAt\(\(current\) => current \?\? clockInstant\(slate\.projectionsAt\)\)/);
  assert.match(today, /setLinesAt\(\(current\) => current \?\? clockInstant\(slate\.linesAt\)\)/);
  assert.match(page, /initialProjectionsAt=\{slate\.projectionsAt\}/);
  assert.match(page, /initialLinesAt=\{slate\.linesAt\}/);
  assert.match(projectionsRoute, /finishRun\(committed\.db, "projections", new Date\(\)\.toISOString\(\)\)/);
  assert.match(linesRoute, /finishRun\(committed\.db, "lines", new Date\(\)\.toISOString\(\)\)/);
  assert.doesNotMatch(settingsRoute, /finishRun/);
  assert.doesNotMatch(betsRoute, /finishRun/);
  assert.doesNotMatch(lineupsRoute, /finishRun/);
  assert.match(storeSource, /projections_finished_at: stamps\.projectionsAt/);
  assert.match(storeSource, /lines_finished_at: stamps\.linesAt/);
  assert.match(storeSource, /upsertSettings\(db\.settings, db\.runStamps/);

  const post = between(today, "async function post", "function put");
  assert.match(post, /url === "\/api\/projections" \? "Projections" : url === "\/api\/consensus" \? "Lines"/);
  assert.match(post, /setRunning\(runName\)/);
  assert.match(post, /setProjectionsAt\(new Date\(\)\)/);
  assert.match(post, /setLinesAt\(new Date\(\)\)/);
  assert.doesNotMatch(post, /setRanAt/);

  const check = between(today, "async function checkLineups", "function lineupNote");
  assert.doesNotMatch(check, /setRunning/);
  assert.doesNotMatch(check, /setProjectionsAt/);
  assert.doesNotMatch(check, /setLinesAt/);
  assert.doesNotMatch(check, /setRanAt/);
  assert.doesNotMatch(check, /labeled/);

  assert.match(today, /put\("\/api\/bets"/);
});

test("the Import card is off the Today page", () => {
  assert.doesNotMatch(today, /<h2>Import<\/h2>/);
  assert.doesNotMatch(today, /Import file/);
  assert.doesNotMatch(today, /CSV and JSON/);
  assert.doesNotMatch(today, /setImportText/);
});
