import assert from "node:assert/strict";
import test from "node:test";
import { emptyDatabase, type Actual, type Game, type Player } from "../lib/engine";
import { homeworkRows, priorGames, type HomeworkCandidate, type HomeworkLog, type HomeworkStat } from "../lib/homework";
import type { LineupTeam } from "../lib/sources/rotowire-lineups";

const DATE = "2026-11-14";

function candidate(
  playerName: string,
  stat: HomeworkStat,
  projection: number | null,
  line: number | null,
  extra: Partial<HomeworkCandidate> = {},
): HomeworkCandidate {
  const edge = projection == null || line == null || !Number.isFinite(projection) || !Number.isFinite(line)
    ? null
    : projection - line;
  return {
    playerId: extra.playerId ?? playerName.toLowerCase().replaceAll(" ", "-"),
    gameId: extra.gameId ?? "g1",
    playerName,
    teamId: extra.teamId ?? "DAL",
    opponentId: extra.opponentId ?? "DEN",
    position: extra.position ?? "C",
    stat,
    projection,
    line,
    edge: extra.edge === undefined ? edge : extra.edge,
    minutesUsed: extra.minutesUsed ?? null,
  };
}

function log(playerId: string, playerName: string, date: string, points: number | null, rebounds: number | null, extra: Partial<HomeworkLog> = {}): HomeworkLog {
  return {
    playerId,
    playerName,
    teamId: extra.teamId ?? "DAL",
    position: extra.position ?? "C",
    gameId: extra.gameId ?? `${date}|DEN@DAL`,
    date,
    points,
    rebounds,
    minutes: extra.minutes === undefined ? null : extra.minutes,
  };
}

function team(players: LineupTeam["players"], confirmed = false, teamId = "DAL"): LineupTeam {
  return { teamId, confirmed, players };
}

test("homework keeps the eight largest points and rebounds gaps", () => {
  const rows = [
    candidate("Above small", "points", 21, 20),
    candidate("Below big", "rebounds", 10, 22),
    candidate("Above mid", "points", 30, 24),
    candidate("Below mid", "rebounds", 8, 14),
    candidate("Above big", "points", 40, 25),
    candidate("Tie high A", "points", 18, 10),
    candidate("Tie high B", "rebounds", 2, 10),
    candidate("Above four", "points", 14, 10),
    candidate("Cut off", "rebounds", 12, 10),
    candidate("No line", "points", 99, null),
    candidate("No projection", "rebounds", null, 20),
    candidate("Not a number", "points", Number.NaN, 12),
    candidate("Other team", "points", 50, 10, { teamId: "LAL", opponentId: "GSW" }),
  ];
  const all = homeworkRows({ date: DATE, rows, logs: [], lineups: null });
  assert.deepEqual(all.map((row) => `${row.playerName} ${row.statLabel}`), [
    "Other team Points",
    "Above big Points",
    "Below big Rebounds",
    "Tie high A Points",
    "Tie high B Rebounds",
    "Above mid Points",
    "Below mid Rebounds",
    "Above four Points",
  ]);
  assert.equal(all.length, 8);
  assert.equal(all.find((row) => row.playerName === "Below big")?.delta, -12);
  assert.equal(all.find((row) => row.playerName === "Above big")?.delta, 15);
  assert.equal(all.some((row) => row.playerName === "Cut off"), false);

  const dallas = homeworkRows({ date: DATE, teamId: "DAL", rows, logs: [], lineups: null });
  assert.equal(dallas.some((row) => row.teamId !== "DAL"), false);
  assert.equal(dallas[0]?.playerName, "Above big");
  assert.equal(dallas.some((row) => row.playerName === "Cut off"), true);
});

test("one player can take two rows when both stats are wide", () => {
  const rows = [
    candidate("Bam Adebayo", "points", 28, 22, { playerId: "adebaba01", position: "C", teamId: "MIA", opponentId: "ORL" }),
    candidate("Bam Adebayo", "rebounds", 11.6, 8.5, { playerId: "adebaba01", position: "C", teamId: "MIA", opponentId: "ORL" }),
    candidate("Small", "points", 10, 9.5),
  ];
  const listed = homeworkRows({ date: DATE, rows, logs: [], lineups: null });
  assert.deepEqual(listed.map((row) => row.statLabel), ["Points", "Rebounds", "Points"]);
  assert.equal(listed[0]?.playerName, "Bam Adebayo");
  assert.equal(listed[1]?.playerName, "Bam Adebayo");
  assert.ok(Math.abs((listed[1]?.delta ?? 0) - 3.1) < 1e-9);
});

test("last five games list the stat once and minutes only when stored", () => {
  const lively = candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01" });
  const dates = ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07", "2026-11-09", "2026-11-11", "2026-11-14"];
  const logs = dates.map((date, index) => log("livelde01", "Dereck Lively II", date, 4, index + 1, {
    minutes: index === 6 ? 30 : null,
  }));
  const withoutMinutes = homeworkRows({ date: DATE, rows: [lively], logs, lineups: null });
  assert.equal(withoutMinutes[0]?.last5, "Reb 2, 3, 4, 5, 6");

  const withMinutes = logs.map((row, index) => ({ ...row, minutes: index === 6 ? null : 20 + index }));
  const shown = homeworkRows({ date: DATE, rows: [lively], logs: withMinutes, lineups: null });
  assert.equal(shown[0]?.last5, "Min 21, 22, 23, 24, 25 · Reb 2, 3, 4, 5, 6");
  assert.equal(shown[0]?.note, null);

  const acuff = candidate("Darius Acuff Jr.", "points", 28, 24.5, { playerId: "acuffda01" });
  const fractional = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08", "2026-11-10"].map((date, index) =>
    log("acuffda01", "Darius Acuff Jr.", date, [25, 22, 22.4, 32, 29][index], 4, { minutes: [36.8, 42.5, 33.5, 39.4, 39.9][index] }),
  );
  const rounded = homeworkRows({ date: DATE, rows: [acuff], logs: fractional, lineups: null })[0];
  assert.equal(rounded?.last5, "Min 37, 43, 34, 39, 40 · Pts 25, 22, 22.4, 32, 29");

  const stored = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08", "2026-11-10"].map((date, index) =>
    log("acuffda01", "Darius Acuff Jr.", date, 25, 4, {
      gameId: `${date}|stored`,
      minutes: [36.833333333333336, 42.46666666666667, 33.45, 39.35, 39.86666666666667][index],
    }),
  );
  const fromClock = homeworkRows({ date: DATE, rows: [acuff], logs: stored, lineups: null })[0];
  assert.equal(fromClock?.last5, "Min 37, 43, 34, 39, 40 · Pts 25, 25, 25, 25, 25");
});

test("a usual starter gets no extra sentence", () => {
  const sabonis = candidate("Domantas Sabonis", "rebounds", 12, 10, {
    playerId: "sabondo01",
    teamId: "SAC",
    opponentId: "LAL",
    minutesUsed: 34,
  });
  const logs: HomeworkLog[] = [];
  for (let day = 1; day <= 5; day += 1) {
    const date = `2026-11-0${day}`;
    logs.push(log("sabondo01", "Domantas Sabonis", date, 20, 12, { teamId: "SAC" }));
    logs.push(log("lenal01", "Alex Len", date, 4, 3, { teamId: "SAC" }));
  }
  const lineups = [team([
    { name: "Domantas Sabonis", role: "starter", injury: null, position: "C" },
    { name: "Alex Len", role: "bench", injury: "Out", position: "C" },
  ], false, "SAC")];
  const row = homeworkRows({ date: DATE, rows: [sabonis], logs, lineups })[0];
  assert.equal(row?.role, "Starting");
  assert.equal(row?.injury, null);
  assert.equal(row?.note, null);
  assert.equal(row?.note?.includes("Sabonis starting"), undefined);
  assert.equal(JSON.stringify(row), JSON.stringify(row).replace("no other starter returned", ""));
});

test("a starter replacing an out teammate keeps the role and leaves the note for a sourced story", () => {
  const lively = candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01", minutesUsed: 21 });
  const logs: HomeworkLog[] = [];
  for (const date of ["2026-11-08", "2026-11-10"]) {
    logs.push(log("livelde01", "Dereck Lively II", date, 6, 6));
  }
  for (const date of ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08", "2026-11-10"]) {
    logs.push(log("gaffoda01", "Daniel Gafford", date, 8, 10));
  }
  const lineups = [team([
    { name: "Dereck Lively II", role: "starter", injury: null, position: "C" },
    { name: "Daniel Gafford", role: "bench", injury: "Out", position: "C" },
  ], true)];
  const row = homeworkRows({ date: DATE, rows: [lively], logs, lineups })[0];
  assert.equal(row?.role, "Starting · confirmed");
  assert.equal(row?.note, null);
  assert.equal(row?.last5, "Reb 6, 6");
});

test("two recently active teammates at the same spot produce no sentence", () => {
  const lively = candidate("Dereck Lively II", "points", 12, 8, { playerId: "livelde01" });
  const logs = [
    log("gaffoda01", "Daniel Gafford", "2026-11-10", 8, 10),
    log("poweldw01", "Dwight Powell", "2026-11-10", 7, 8),
  ];
  const lineups = [team([
    { name: "Dereck Lively II", role: "starter", injury: null, position: "C" },
    { name: "Daniel Gafford", role: "bench", injury: "Out", position: "C" },
    { name: "Dwight Powell", role: "bench", injury: "Out", position: "C" },
  ])];
  assert.equal(homeworkRows({ date: DATE, rows: [lively], logs, lineups })[0]?.note, null);
});

test("a broad guard tag does not pick one of two starters", () => {
  const maxey = candidate("Tyrese Maxey", "points", 30, 24, { playerId: "maxeyty01", position: "PG", teamId: "PHI", opponentId: "DET" });
  const logs = [log("goodwjo01", "Jordan Goodwin", "2026-11-10", 8, 3, { teamId: "PHI", position: "PG" })];
  const lineups = [team([
    { name: "Tyrese Maxey", role: "starter", injury: null, position: "PG" },
    { name: "De'Aaron Fox", role: "starter", injury: null, position: "SG" },
    { name: "Jordan Goodwin", role: "bench", injury: "Out", position: "G" },
  ], false, "PHI")];
  assert.equal(homeworkRows({ date: DATE, rows: [maxey], logs, lineups })[0]?.note, null);
});

test("an out teammate with no stored games is not called a change", () => {
  const lively = candidate("Dereck Lively II", "rebounds", 9, 7, { playerId: "livelde01" });
  const lineups = [team([
    { name: "Dereck Lively II", role: "starter", injury: null, position: "C" },
    { name: "Daniel Gafford", role: "bench", injury: "Out for season", position: "C" },
  ])];
  assert.equal(homeworkRows({ date: DATE, rows: [lively], logs: [], lineups })[0]?.note, null);
});

test("a stored minute gap does not write the Expect flag", () => {
  const lively = candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01", minutesUsed: 22 });
  const enough = ["2026-10-01", "2026-11-02", "2026-11-08", "2026-11-12"].map((date, index) =>
    log("livelde01", "Dereck Lively II", date, 6, 8, { minutes: index === 0 ? 40 : 14 }),
  );
  const row = homeworkRows({ date: DATE, rows: [lively], logs: enough, lineups: null })[0];
  assert.equal(row?.last5, "Min 40, 14, 14, 14 · Reb 8, 8, 8, 8");
  assert.equal(row?.note, null);
  assert.equal(JSON.stringify(row).includes("Expect"), false);
});

test("a minute gap and a lineup change leave the note blank", () => {
  const lively = candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01", minutesUsed: 21 });
  const logs = [
    log("livelde01", "Dereck Lively II", "2026-11-08", 6, 6, { minutes: 14 }),
    log("livelde01", "Dereck Lively II", "2026-11-10", 6, 6, { minutes: 14 }),
    log("livelde01", "Dereck Lively II", "2026-11-12", 6, 6, { minutes: 14 }),
    log("gaffoda01", "Daniel Gafford", "2026-11-10", 8, 10),
  ];
  const lineups = [team([
    { name: "Dereck Lively II", role: "starter", injury: null, position: "C" },
    { name: "Daniel Gafford", role: "bench", injury: "Out", position: "C" },
  ])];
  const row = homeworkRows({ date: DATE, rows: [lively], logs, lineups })[0];
  assert.equal(row?.role, "Starting");
  assert.equal(row?.note, null);
  assert.equal(row?.last5, "Min 14, 14, 14 · Reb 6, 6, 6");
  assert.equal(JSON.stringify(row).includes("Expect"), false);
});

test("injury tag stays on the role line and a bench player is not called a new starter", () => {
  const bam = candidate("Bam Adebayo", "rebounds", 11, 8, { playerId: "adebaba01", teamId: "MIA", opponentId: "ORL" });
  const lineups = [team([
    { name: "Bam Adebayo", role: "starter", injury: "Probable", position: "C" },
  ], false, "MIA")];
  const starter = homeworkRows({ date: DATE, rows: [bam], logs: [], lineups })[0];
  assert.equal(starter?.role, "Starting");
  assert.equal(starter?.injury, "Probable");
  assert.equal(starter?.note, null);

  const bench = candidate("Keegan Murray", "points", 14, 17, { playerId: "murrake01", position: "SF", teamId: "SAC", opponentId: "LAL" });
  const benchLineups = [team([
    { name: "Keegan Murray", role: "bench", injury: "Questionable", position: "SF" },
    { name: "Domantas Sabonis", role: "bench", injury: "Out", position: "C" },
  ], false, "SAC")];
  const benched = homeworkRows({ date: DATE, rows: [bench], logs: [log("sabondo01", "Domantas Sabonis", "2026-11-10", 20, 12, { teamId: "SAC", position: "C" })], lineups: benchLineups })[0];
  assert.equal(benched?.role, "Bench");
  assert.equal(benched?.injury, "Questionable");
  assert.equal(benched?.note, null);
});

test("prior games are stored results from before the slate, without invented minutes", () => {
  const db = emptyDatabase();
  const player = (playerId: string, displayName: string): Player => ({
    playerId,
    displayName,
    teamId: "DAL",
    position: "C",
    season: "2026-27",
  });
  const game = (gameDate: string): Game => ({
    gameId: `${gameDate}|DEN@DAL`,
    season: "2026-27",
    gameDate,
    homeTeamId: "DAL",
    awayTeamId: "DEN",
    status: "final",
  });
  const actual = (playerId: string, gameDate: string, dnp = false): Actual => ({
    playerId,
    gameId: `${gameDate}|DEN@DAL`,
    season: "2026-27",
    dnp,
    points: dnp ? null : 8,
    rebounds: dnp ? null : 10,
    sourceTimestamp: null,
  });
  db.players.push(player("livelde01", "Dereck Lively II"));
  db.games.push(game("2026-10-01"), game("2026-11-10"), game(DATE));
  db.actuals.push(
    actual("livelde01", "2026-10-01"),
    actual("livelde01", "2026-11-10"),
    actual("livelde01", DATE),
    actual("livelde01", "2026-11-09", true),
    actual("ghost01", "2026-11-10"),
  );
  db.games.push(game("2026-11-09"));
  const withMinutes = db.actuals.find((row) => row.gameId === "2026-11-10|DEN@DAL" && row.playerId === "livelde01");
  if (withMinutes) withMinutes.minutes = 14;

  const logs = priorGames(db, DATE);
  assert.deepEqual(logs.map((row) => row.date), ["2026-10-01", "2026-11-10"]);
  assert.equal(logs.find((row) => row.date === "2026-10-01")?.minutes, null);
  assert.equal(logs.find((row) => row.date === "2026-11-10")?.minutes, 14);
  assert.equal(logs.every((row) => row.playerId === "livelde01"), true);
});

test("a stored story is the note under the last five, and a quiet row has none", () => {
  const db = emptyDatabase();
  db.players.push({ playerId: "livelde01", displayName: "Dereck Lively II", teamId: "DAL", position: "C", season: "2026-27" });
  for (const date of ["2026-11-02", "2026-11-08", "2026-11-12"]) {
    db.games.push({ gameId: `${date}|DEN@DAL`, season: "2026-27", gameDate: date, homeTeamId: "DAL", awayTeamId: "DEN", status: "final" });
    db.actuals.push({
      playerId: "livelde01",
      gameId: `${date}|DEN@DAL`,
      season: "2026-27",
      dnp: false,
      points: 6,
      rebounds: 6,
      minutes: 14,
      sourceTimestamp: null,
    });
  }
  const lively = candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01", minutesUsed: 21 });
  const logs = priorGames(db, DATE);
  const row = homeworkRows({ date: DATE, rows: [lively], logs, lineups: null })[0];
  assert.equal(row?.last5, "Min 14, 14, 14 · Reb 6, 6, 6");
  assert.equal(row?.note, null);
  const story = "Sabonis is out, so the backup center is in line for the extra minutes.";
  const withStory = homeworkRows({
    date: DATE,
    rows: [lively],
    logs,
    lineups: null,
    stories: [{ playerId: "livelde01", gameId: "g1", stat: "rebounds", text: story }],
  })[0];
  assert.equal(withStory?.note, story);
  assert.equal(withStory?.note?.includes("7.5"), false);
  assert.equal(withStory?.note?.includes("6, 6, 6"), false);
  assert.equal(withStory?.note?.includes("Expect"), false);

  const quiet = homeworkRows({
    date: DATE,
    rows: [candidate("Dereck Lively II", "rebounds", 9.9, 7.5, { playerId: "livelde01", minutesUsed: 14 })],
    logs: priorGames(db, DATE),
    lineups: null,
  })[0];
  assert.equal(quiet?.note, null);
});
