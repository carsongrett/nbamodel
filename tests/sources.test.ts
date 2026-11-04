import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyModelRun, buildSlate, CURRENT_SEASON, defenseVsPosition, dvpWindowNote, emptyDatabase, opponentReboundDiffs, setPropLine, weightedDvp, weightedOppReboundDiff, type Player } from "../lib/engine.ts";
import { applyPublicPages, stripSample, type FetchedPage, type PublicFetch } from "../lib/sources/apply.ts";
import { applyBettingProsProbe } from "../lib/sources/apply-bettingpros.ts";
import { fetchBettingProsDay, parseGameMarket, type ProbeResult } from "../lib/sources/bettingpros.ts";
import { collectLines, collectProjectionSources, commitLines, commitProjections, FANTASYPROS_DVP_URL, TEAMRANKINGS_OPP_REBOUNDS_URL } from "../lib/sources/daily-run.ts";
import { fetchDimersSlate, probeRoundNumbers } from "../lib/sources/dimers.ts";
import { applyEspnOdds, parseEspnOdds } from "../lib/sources/espn.ts";
import { parseEnvText, readProjectEnv } from "../lib/sources/env-file.ts";
import { parseFanduelDefense, parseSportsLine, parseTeamRankingsOppRebounds } from "../lib/sources/parsers.ts";
import { canonicalTeam, teamFromLabel } from "../lib/sources/teams.ts";

const retrievedAt = "2026-11-02T18:00:00.000Z";

function page(html: string): FetchedPage {
  return { url: "https://example.test", ok: true, html };
}

function fanduelHtml(rows: { window: "GC-15" | "GC-30"; abbr: string; pos: string; points: string; rebounds: string }[]): string {
  const body = rows.map((row) => `<tr style="display:none;" class="${row.window} ${row.pos}"><td class="left team-cell"><span class="team-logo team-logo--circle nba-${row.abbr}">${row.abbr.toUpperCase()}</span></td><td class="center"><b>8</b></td><td class="center"><b>${row.points}</b></td><td class="center"><b>${row.rebounds}</b></td></tr>`).join("");
  return `2026-2027<table><thead><tr><th>Team</th><th>GP</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${body}</tbody></table>`;
}

function teamRankingsHtml(rows: [string, string, string][]): string {
  const body = rows.map(([name, season, last3]) => `<tr><td class="rank">1</td><td data-sort="${name}"><a href="https://www.teamrankings.com/nba/team/${name.toLowerCase()}">${name}</a></td><td data-sort="${season}">${season}</td><td data-sort="99">${last3}</td><td>1.0</td><td>2.0</td><td>3.0</td><td>4.0</td></tr>`).join("");
  return `2026-2027<table class="tr-table datatable scrollable"><thead><tr><th>Rank</th><th>Team</th><th>2026</th><th>Last 3</th><th>Last 1</th><th>Home</th><th>Away</th><th>2025</th></tr></thead><tbody>${body}</tbody></table>`;
}

function failed(error: string): FetchedPage {
  return { url: "https://example.test", ok: false, error };
}

function bundle(overrides: Partial<PublicFetch> = {}): PublicFetch {
  return {
    advanced: page(`2026-27<table><tr>
      <td data-stat="name_display" data-append-csv="doncilu01">Luka Doncic</td>
      <td data-stat="team_name_abbr">LAL</td>
      <td data-stat="pos">PG</td>
      <td data-stat="games">10</td>
      <td data-stat="usg_pct">32.5</td>
    </tr></table>`),
    perGame: page(`2026-27<table><tr>
      <td data-stat="name_display" data-append-csv="doncilu01">Luka Doncic</td>
      <td data-stat="team_name_abbr">LAL</td>
      <td data-stat="pos">PG</td>
      <td data-stat="games">10</td>
      <td data-stat="trb_per_g">8</td>
      <td data-stat="mp_per_g">36</td>
    </tr></table>`),
    pace: page(`2026-27<table id="advanced-team"><tr>
      <td><a href="/teams/LAL/2027.html">Lakers</a></td><td data-stat="pace">102</td>
    </tr><tr>
      <td><a href="/teams/TOR/2027.html">Raptors</a></td><td data-stat="pace">98</td>
    </tr><tr>
      <td><a href="/teams/BRK/2027.html">Nets</a></td><td data-stat="pace">100</td>
    </tr></table>`),
    last15: [1, 2].map((day) => ({
      date: `2026-10-${20 + day}`,
      page: page(`<table><tr>
        <td data-stat="player" data-append-csv="doncilu01">Luka Doncic</td>
        <td data-stat="team_id">LAL</td>
        <td data-stat="opp_id">TOR</td>
        <td data-stat="pts">${20 + day}</td>
        <td data-stat="trb">8</td>
      </tr></table>`),
    })),
    actuals: page(`<table><tr>
      <td data-stat="player" data-append-csv="doncilu01">Luka Doncic</td>
      <td data-stat="team_id">LAL</td>
      <td data-stat="game_location"></td>
      <td data-stat="opp_id">TOR</td>
      <td data-stat="pts">30</td>
      <td data-stat="trb">9</td>
    </tr></table>`),
    sportsline: page(`<table><thead><tr>
      <th id="PLAYER">PLAYER</th><th id="TEAM">TEAM</th><th id="GAME">GAME</th>
      <th id="PROJ">PROJ</th><th id="PTS">PTS</th><th id="MIN">MIN</th><th id="TRB">TRB</th>
    </tr></thead><tbody><tr>
      <td>Luka Doncic</td><td>LAL</td><td>TOR@LAL</td><td>1</td><td>32.3</td><td>36</td><td>8</td>
    </tr></tbody></table>`),
    fantasypros: page(fanduelHtml([
      { window: "GC-15", abbr: "lal", pos: "PG", points: "20", rebounds: "4" },
      { window: "GC-30", abbr: "lal", pos: "PG", points: "20", rebounds: "4" },
      { window: "GC-15", abbr: "bos", pos: "PG", points: "30", rebounds: "8" },
      { window: "GC-30", abbr: "bos", pos: "PG", points: "30", rebounds: "8" },
    ])),
    teamrankings: page(teamRankingsHtml([
      ["Portland", "47.0", "50.7"],
      ["Houston", "40.0", "40.0"],
    ])),
    retrievedAt,
    ...overrides,
  };
}

test("env files accept a named key, quotes, and a bare key", () => {
  assert.equal(parseEnvText("BETTINGPROS_API_KEY=abc123\n").BETTINGPROS_API_KEY, "abc123");
  assert.equal(parseEnvText("export BETTINGPROS_API_KEY=\"abc 123\"\n").BETTINGPROS_API_KEY, "abc 123");
  assert.equal(parseEnvText("only-the-key-value-0123456789\n").BETTINGPROS_API_KEY, "only-the-key-value-0123456789");
  const directory = mkdtempSync(join(tmpdir(), "nbamodel-env-"));
  writeFileSync(join(directory, ".env"), "BETTINGPROS_API_KEY=\nOTHER=1\n");
  writeFileSync(join(directory, ".env.local"), "BETTINGPROS_API_KEY=from-local\n");
  const report = readProjectEnv(directory);
  assert.equal(report.key, "from-local");
  assert.equal(report.source, ".env.local");
  assert.deepEqual(report.names.sort(), ["BETTINGPROS_API_KEY", "OTHER"]);
  rmSync(directory, { recursive: true });
});

test("team aliases are exact and combined rows are not teams", () => {
  assert.equal(canonicalTeam("BRK"), "BKN");
  assert.equal(canonicalTeam("gs"), "GSW");
  assert.equal(canonicalTeam("PHO"), "PHX");
  assert.equal(canonicalTeam("NOR"), "NOP");
  assert.equal(canonicalTeam("UTH"), "UTA");
  assert.equal(canonicalTeam("WSH"), "WAS");
  assert.equal(canonicalTeam("TOT"), null);
  assert.equal(canonicalTeam("Lakers"), null);
});

test("the same matchup under another abbreviation keeps the spread and still opens", () => {
  const date = "2026-11-02";
  const nop = `${date}|NOP@MEM`;
  const nor = `${date}|NOR@MEM`;
  const utah = `${date}|UTA@SAS`;
  const uth = `${date}|UTH@SAS`;
  const bare = `${date}|DAL@BOS`;
  const db = {
    ...emptyDatabase(),
    players: [
      { playerId: "willizi01", displayName: "Zion Williamson", teamId: "NOR", position: "PF" as const, season: CURRENT_SEASON },
      { playerId: "moranja01", displayName: "Ja Morant", teamId: "MEM", position: "PG" as const, season: CURRENT_SEASON },
      { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "DAL", position: "PG" as const, season: CURRENT_SEASON },
    ],
    games: [
      { gameId: nop, season: CURRENT_SEASON, gameDate: date, homeTeamId: "MEM", awayTeamId: "NOP", status: "scheduled" as const },
      { gameId: nor, season: CURRENT_SEASON, gameDate: date, homeTeamId: "MEM", awayTeamId: "NOR", status: "scheduled" as const },
      { gameId: utah, season: CURRENT_SEASON, gameDate: date, homeTeamId: "SAS", awayTeamId: "UTA", status: "scheduled" as const },
      { gameId: uth, season: CURRENT_SEASON, gameDate: date, homeTeamId: "SAS", awayTeamId: "UTH", status: "scheduled" as const },
      { gameId: bare, season: CURRENT_SEASON, gameDate: date, homeTeamId: "BOS", awayTeamId: "DAL", status: "scheduled" as const },
    ],
    vegas: [
      { gameId: nop, teamId: "MEM", season: CURRENT_SEASON, spread: -5.5, total: 232.5, sourceTimestamp: retrievedAt },
      { gameId: utah, teamId: "SAS", season: CURRENT_SEASON, spread: -16.5, total: 228.5, sourceTimestamp: retrievedAt },
    ],
    projections: [
      { playerId: "willizi01", gameId: nor, source: "sportsline", season: CURRENT_SEASON, points: 24, rebounds: 7, minutes: 33, sourceTimestamp: retrievedAt },
      { playerId: "moranja01", gameId: nop, source: "sportsline", season: CURRENT_SEASON, points: 22, rebounds: 5, minutes: 32, sourceTimestamp: retrievedAt },
      { playerId: "doncilu01", gameId: bare, source: "sportsline", season: CURRENT_SEASON, points: 30, rebounds: 8, minutes: 36, sourceTimestamp: retrievedAt },
    ],
  };
  const slate = buildSlate(db, date);
  assert.deepEqual(slate.games.map((game) => game.label), ["DAL at BOS", "NOP at MEM", "UTA at SAS"]);
  assert.equal(slate.games.find((game) => game.gameId === nop)?.spread, -5.5);
  assert.equal(slate.games.find((game) => game.gameId === nop)?.total, 232.5);
  assert.equal(slate.games.find((game) => game.gameId === utah)?.spread, -16.5);
  assert.equal(slate.games.find((game) => game.gameId === utah)?.total, 228.5);
  assert.equal(slate.games.find((game) => game.gameId === bare)?.spread, null);
  assert.equal(slate.games.find((game) => game.gameId === bare)?.total, null);
  assert.equal(slate.rows.filter((row) => row.gameId === nop).length, 2);
  const zion = slate.rows.find((row) => row.playerId === "willizi01");
  const luka = slate.rows.find((row) => row.playerId === "doncilu01");
  assert.equal(zion?.teamId, "NOP");
  assert.equal(zion?.stats.points.blockReason, null);
  assert.equal(zion?.stats.points.projection != null, true);
  assert.equal(luka?.stats.points.blockReason, null);
  assert.equal(slate.rows.some((row) => row.gameId === nor || row.gameId === uth), false);
});

test("sportsline uses PTS MIN and TRB and ignores PROJ", () => {
  const rows = parseSportsLine(bundle().sportsline.ok ? bundle().sportsline.html : "");
  assert.equal(rows[0]?.points, 32.3);
  assert.equal(rows[0]?.minutes, 36);
  assert.equal(rows[0]?.rebounds, 8);
  assert.notEqual(rows[0]?.points, 1);
});

function sportsline(player: string, team: string): FetchedPage {
  return page(`<table><thead><tr>
    <th id="PLAYER">PLAYER</th><th id="TEAM">TEAM</th><th id="GAME">GAME</th>
    <th id="PTS">PTS</th><th id="MIN">MIN</th><th id="TRB">TRB</th>
  </tr></thead><tbody><tr>
    <td>${player}</td><td>${team}</td><td>TOR@LAL</td><td>32.3</td><td>36</td><td>8</td>
  </tr></tbody></table>`);
}

function roster(rows: { id: string; name: string; team: string }[]): FetchedPage {
  const body = rows.map((row) => `<tr>
    <td data-stat="name_display" data-append-csv="${row.id}">${row.name}</td>
    <td data-stat="team_name_abbr">${row.team}</td>
    <td data-stat="pos">PG</td>
    <td data-stat="games">10</td>
    <td data-stat="usg_pct">32.5</td>
    <td data-stat="trb_per_g">8</td>
    <td data-stat="mp_per_g">36</td>
  </tr>`).join("");
  return page(`2026-27<table>${body}</table>`);
}

test("public pages match one exact name, skip a non-current season, and do not duplicate", () => {
  const seeded = emptyDatabase();
  seeded.players.push({ playerId: "player_luka", displayName: "Luka", teamId: "DAL", position: "PG", season: CURRENT_SEASON });
  seeded.games.push({ gameId: "game_20261101_dal_bos", season: CURRENT_SEASON, gameDate: "2026-11-01", homeTeamId: "BOS", awayTeamId: "DAL", status: "scheduled" });
  seeded.lines.push({ playerId: "player_luka", gameId: "game_20261101_dal_bos", stat: "points", season: CURRENT_SEASON, line: 29.5, overOdds: -110, underOdds: -110, source: "samplebook", sourceTimestamp: retrievedAt });
  const first = applyPublicPages(seeded, "2026-11-02", bundle());
  assert.equal(first.db.players.some((player) => player.playerId === "player_luka"), false);
  assert.equal(first.db.games.some((game) => game.gameId.startsWith("game_")), false);
  assert.equal(first.db.lines.some((line) => line.source === "samplebook"), false);
  assert.equal(stripSample(seeded).removed, 2);
  assert.equal(first.db.players.length, 1);
  assert.equal(first.db.players[0]?.playerId, "doncilu01");
  assert.equal(first.db.projections.length, 1);
  assert.equal(first.db.projections[0]?.points, 32.3);
  assert.equal(first.db.projections[0]?.playerId, "doncilu01");
  const rate = first.db.rates[0];
  assert.equal(rate?.usgPct, 32.5);
  assert.equal(rate?.rebPerMinute, 8 / 36);
  assert.equal(rate?.recentPointsPerGame, (21 + 22) / 2);
  assert.equal(rate?.recentGames, 2);
  assert.equal(first.db.pace.find((row) => row.teamId === "LAL")?.paceDiff, 2);
  assert.equal(first.db.pace.find((row) => row.teamId === "BKN")?.pace, 100);
  assert.equal(first.db.actuals.length, 1);
  assert.equal(first.db.actuals[0]?.gameId, "2026-11-02|TOR@LAL");
  const lal = first.db.dvp.find((row) => row.teamId === "LAL" && row.position === "PG");
  assert.equal(lal?.pointsDiff, 20 - 25);
  assert.equal(lal?.reboundsDiff, 4 - 6);

  const again = applyPublicPages(first.db, "2026-11-02", bundle());
  assert.equal(again.db.projections.length, 1);
  assert.equal(again.db.players.length, 1);
  assert.equal(again.db.actuals.length, 1);
  assert.equal(again.db.dvp.filter((row) => row.position === "PG").length, 2);

  const oldHtml = page("<table><tr><td data-stat=\"name_display\" data-append-csv=\"old1\">Old</td><td data-stat=\"team_name_abbr\">BOS</td><td data-stat=\"pos\">PG</td><td data-stat=\"usg_pct\">20</td><td data-stat=\"games\">10</td></tr></table>");
  const old = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({ advanced: oldHtml, perGame: oldHtml }));
  assert.equal(old.db.players.length, 0);
  assert.match(old.messages.map((item) => item.message).join(" "), /not a 2026–27 page/);
});

test("a later refresh grades box scores for games already on the desk", () => {
  const dayOne = applyPublicPages(emptyDatabase(), "2026-11-01", bundle({
    actuals: page("<table></table>"),
    last15: [],
  }));
  assert.equal(dayOne.db.players[0]?.playerId, "doncilu01");
  assert.equal(dayOne.db.games.find((game) => game.gameId === "2026-11-01|TOR@LAL")?.status, "scheduled");
  assert.equal(dayOne.db.actuals.length, 0);

  const leaders = page(`<table><tr>
    <td data-stat="player" data-append-csv="doncilu01">Luka Doncic</td>
    <td data-stat="team_id">LAL</td>
    <td data-stat="game_location"></td>
    <td data-stat="opp_id">TOR</td>
    <td data-stat="pts">28</td>
    <td data-stat="trb">11</td>
  </tr><tr>
    <td data-stat="player" data-append-csv="nobody01">Nobody</td>
    <td data-stat="team_id">BOS</td>
    <td data-stat="opp_id">NYK</td>
    <td data-stat="pts">4</td>
    <td data-stat="trb">1</td>
  </tr></table>`);
  const dayTwo = applyPublicPages(dayOne.db, "2026-11-02", bundle({
    last15: [{ date: "2026-11-01", page: leaders }],
    actuals: page("<table></table>"),
  }));
  assert.equal(dayTwo.db.games.find((game) => game.gameId === "2026-11-01|TOR@LAL")?.status, "final");
  assert.equal(dayTwo.db.actuals.length, 1);
  assert.equal(dayTwo.db.actuals[0]?.points, 28);
  assert.equal(dayTwo.db.actuals[0]?.rebounds, 11);
  assert.equal(dayTwo.db.players.some((player) => player.playerId === "nobody01"), false);
  assert.equal(dayTwo.db.games.some((game) => game.gameId === "2026-11-01|NYK@BOS"), false);
  assert.match(dayTwo.messages.map((item) => item.message).join(" "), /graded 1 result on 1 earlier date/);
});

test("sportsline names match only one normalized player on the same team", () => {
  const accentRoster = roster([{ id: "doncilu01", name: "Luka Doncic", team: "LAL" }]);
  const accent = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    advanced: accentRoster,
    perGame: accentRoster,
    sportsline: sportsline("Luka Dončić", "LAL"),
  }));
  assert.equal(accent.db.players.length, 1);
  assert.equal(accent.db.projections[0]?.playerId, "doncilu01");

  const junior = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    advanced: accentRoster,
    perGame: accentRoster,
    sportsline: sportsline("Luka Doncic Jr", "LAL"),
  }));
  assert.equal(junior.db.players.length, 0);
  assert.equal(junior.db.projections.length, 0);

  const otherTeam = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    advanced: accentRoster,
    perGame: accentRoster,
    sportsline: sportsline("Luka Doncic", "BOS"),
  }));
  assert.equal(otherTeam.db.players.length, 0);

  const twins = roster([
    { id: "doncilu01", name: "Luka Doncic", team: "LAL" },
    { id: "doncilu02", name: "Luka Doncic", team: "LAL" },
  ]);
  const ambiguous = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    advanced: twins,
    perGame: twins,
    sportsline: sportsline("Luka Doncic", "LAL"),
  }));
  assert.equal(ambiguous.db.players.length, 0);
  assert.equal(ambiguous.db.projections.length, 0);
});

function offerBody(marketId: number, page: number, totalPages: number, line: number) {
  return JSON.stringify({
    offers: [{
      event_id: 10,
      market_id: marketId,
      player_id: 55,
      participant: { name: "Luka Dončić" },
      selections: [
        { selection: "over", books: [{ id: 0, lines: [{ line, cost: -110 }] }] },
        { selection: "under", books: [{ id: 0, lines: [{ line, cost: -105 }] }] },
      ],
    }],
    pagination: { page, total_pages: totalPages },
  });
}

test("bettingpros day fetch pages after the first offers page parses", async () => {
  const previous = process.env.BETTINGPROS_API_KEY;
  delete process.env.BETTINGPROS_API_KEY;
  let calls = 0;
  const cold = await fetchBettingProsDay("2026-11-02", async () => {
    calls += 1;
    throw new Error("should not be called");
  });
  assert.equal(cold.state, "setup_needed");
  assert.equal(calls, 0);

  process.env.BETTINGPROS_API_KEY = "test-key";
  const urls: string[] = [];
  const day = await fetchBettingProsDay("2026-11-02", async (url, init) => {
    urls.push(url);
    assert.equal(init.headers["x-api-key"], "test-key");
    if (url.includes("/events")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          events: [{ id: 10, home: { abbreviation: "LAL" }, visitor: { abbreviation: "TOR" }, spread: -3.5, total: 220 }],
        }),
      };
    }
    const marketId = Number(new URL(url).searchParams.get("market_id"));
    const pageNumber = Number(new URL(url).searchParams.get("page") ?? "1");
    if (marketId === 129 || marketId === 128) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ offers: [], _pagination: { page: 1, total_pages: 1 } }) };
    }
    const line = marketId === 157 ? 8.5 : 22.5;
    return { ok: true, status: 200, text: async () => offerBody(marketId, pageNumber, 2, line) };
  });
  assert.equal(urls.filter((url) => url.includes("page=2")).length, 2);
  assert.equal(urls.some((url) => url.includes("page=3")), false);
  assert.equal(urls.filter((url) => url.includes("market_id=156")).length, 2);
  assert.equal(urls.filter((url) => url.includes("market_id=157")).length, 2);
  assert.equal(urls.some((url) => url.includes("market_id=336")), false);
  assert.equal(urls.some((url) => url.includes("market_id=129") || url.includes("market_id=128")), false);
  assert.equal(urls[1]?.includes("page="), false);
  assert.equal(day.state, "parsed");
  assert.equal(day.calls.join(" ").includes("test-key"), false);

  const player: Player = { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON };
  const named = applyBettingProsProbe({ ...emptyDatabase(), players: [player] }, "2026-11-02", day, retrievedAt);
  assert.equal(named.db.lines.length, 2);
  assert.equal(named.db.lines.find((line) => line.stat === "points")?.line, 22.5);
  assert.equal(named.db.lines.find((line) => line.stat === "rebounds")?.line, 8.5);
  assert.equal(named.db.lines.some((line) => line.stat === "points_rebounds"), false);
  assert.equal(named.db.idMap.find((item) => item.source === "bettingpros")?.canonicalId, "doncilu01");
  assert.equal(named.db.vegas.length, 0);
  const repeat = applyBettingProsProbe(named.db, "2026-11-02", day, retrievedAt);
  assert.equal(repeat.db.lines.length, 2);

  const unparsedUrls: string[] = [];
  const unparsed = await fetchBettingProsDay("2026-11-02", async (url) => {
    unparsedUrls.push(url);
    if (url.includes("/events")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ events: [{ id: 10, home: "LAL", visitor: "TOR", spread: -3.5, total: 220 }] }) };
    }
    return { ok: true, status: 200, text: async () => "not-json" };
  });
  assert.equal(unparsed.state, "unparsed");
  assert.equal(unparsedUrls.length, 2);

  const stuck: string[] = [];
  const stuckRun = await fetchBettingProsDay("2026-11-02", async (url) => {
    stuck.push(url);
    if (url.includes("/events")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ events: [{ id: 10, home: "LAL", visitor: "TOR" }] }) };
    }
    const marketId = Number(new URL(url).searchParams.get("market_id"));
    return { ok: true, status: 200, text: async () => offerBody(marketId, 1, 5, 10) };
  });
  assert.equal(stuckRun.state, "error");
  assert.match(stuckRun.message, /page 1/);
  assert.equal(stuck.filter((url) => url.includes("page=2")).length, 1);
  assert.equal(stuck.some((url) => url.includes("page=3")), false);

  const ambiguous: ProbeResult = {
    state: "parsed",
    message: "ok",
    calls: [],
    events: [{ id: "10", home: "LAL", away: "TOR", spread: -3.5, total: 220 }],
    offers: [{ eventId: "10", playerId: "55", name: "Luka Doncic", marketId: 156, line: 22.5, overOdds: -110, underOdds: -105 }],
    furtherPages: 0,
  };
  const twins = applyBettingProsProbe({
    ...emptyDatabase(),
    players: [player, { ...player, playerId: "doncilu02", position: "SG" }],
  }, "2026-11-02", ambiguous, retrievedAt);
  assert.equal(twins.db.lines.length, 0);

  const spread = JSON.stringify({
    offers: [{
      market_id: 129,
      selections: [
        { participant: "BOS", books: [{ id: 0, lines: [{ line: -7.5, cost: -113 }] }] },
        { participant: "ORL", books: [{ id: 0, lines: [{ line: 7.5, cost: -108 }] }] },
      ],
    }],
  });
  const total = JSON.stringify({
    offers: [{
      market_id: 128,
      selections: [
        { selection: "over", books: [{ id: 0, lines: [{ line: 222.5, cost: -109 }] }] },
        { selection: "under", books: [{ id: 0, lines: [{ line: 222.5, cost: -110 }] }] },
      ],
    }],
  });
  assert.equal(parseGameMarket(spread, 129, "ORL"), 7.5);
  assert.equal(parseGameMarket(total, 128, "ORL"), 222.5);
  const vegas = applyEspnOdds(emptyDatabase(), "2026-11-01", [{ away: "BOS", home: "ORL", spread: 7.5, total: 222.5, tip: "2026-11-02T00:00Z" }], retrievedAt);
  assert.equal(vegas.db.vegas.find((row) => row.teamId === "ORL")?.spread, 7.5);
  assert.equal(vegas.db.vegas.find((row) => row.teamId === "BOS")?.spread, -7.5);
  assert.equal(vegas.db.vegas[0]?.total, 222.5);

  if (previous == null) delete process.env.BETTINGPROS_API_KEY;
  else process.env.BETTINGPROS_API_KEY = previous;
  assert.equal(failed("down").ok, false);
});

test("bettingpros waits 500ms between offer pulls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const previous = process.env.BETTINGPROS_API_KEY;
  process.env.BETTINGPROS_API_KEY = "test-key";
  const eventsBody = JSON.stringify({
    events: [
      { id: 10, home: { abbreviation: "LAL" }, visitor: { abbreviation: "TOR" } },
      { id: 11, home: { abbreviation: "BOS" }, visitor: { abbreviation: "NYK" } },
    ],
  });

  async function finish<T>(pending: Promise<T>): Promise<T> {
    let done = false;
    const result = pending.then((value) => {
      done = true;
      return value;
    });
    for (let i = 0; i < 20 && !done; i += 1) {
      for (let step = 0; step < 30; step += 1) await Promise.resolve();
      t.mock.timers.runAll();
    }
    if (!done) throw new Error("BettingPros fetch did not finish");
    return result;
  }

  try {
    const urls: string[] = [];
    let eventsAt = -1;
    const offerAt: number[] = [];
    const day = await finish(fetchBettingProsDay("2026-11-02", async (url) => {
      urls.push(url);
      if (url.includes("/events")) {
        eventsAt = Date.now();
        return { ok: true, status: 200, text: async () => eventsBody };
      }
      offerAt.push(Date.now());
      const marketId = Number(new URL(url).searchParams.get("market_id"));
      const pageNumber = Number(new URL(url).searchParams.get("page") ?? "1");
      return { ok: true, status: 200, text: async () => offerBody(marketId, pageNumber, 1, 22.5) };
    }));
    assert.equal(urls.filter((url) => url.includes("/events")).length, 1);
    assert.equal(offerAt.length, 4);
    assert.equal(eventsAt, 0);
    assert.deepEqual(offerAt, [0, 500, 1000, 1500]);
    assert.equal(day.state, "parsed");

    const burst: string[] = [];
    let burstEventsAt = -1;
    const burstAt: number[] = [];
    const stopped = await finish(fetchBettingProsDay("2026-11-02", async (url) => {
      burst.push(url);
      if (url.includes("/events")) {
        burstEventsAt = Date.now();
        return { ok: true, status: 200, text: async () => JSON.stringify({ events: [{ id: 10, home: "LAL", visitor: "TOR" }] }) };
      }
      burstAt.push(Date.now());
      if (burst.filter((item) => item.includes("/offers")).length >= 2) {
        return { ok: false, status: 429, text: async () => "" };
      }
      const marketId = Number(new URL(url).searchParams.get("market_id"));
      return { ok: true, status: 200, text: async () => offerBody(marketId, 1, 3, 22.5) };
    }));
    assert.equal(burst.filter((url) => url.includes("/events")).length, 1);
    assert.equal(burst.filter((url) => url.includes("/offers")).length, 2);
    assert.equal(burst.some((url) => url.includes("page=2")), true);
    assert.equal(burst.some((url) => url.includes("page=3")), false);
    assert.equal(burstAt[0], burstEventsAt);
    assert.equal(burstAt[1] - burstAt[0], 500);
    assert.equal(stopped.state, "error");
    assert.match(stopped.message, /429/);
  } finally {
    t.mock.timers.reset();
    if (previous == null) delete process.env.BETTINGPROS_API_KEY;
    else process.env.BETTINGPROS_API_KEY = previous;
  }
});

function espnCard(tip: string, away: string, home: string, awaySpread: string, homeSpread: string, total: string): string {
  return `<div data-testid="betSixPackTable-item-0">
    <a data-game-link="true">${tip}</a>
    <a href="/nba/team/_/name/${away}/team"></a>
    <a aria-label="pointSpread -110"><div data-testid="OddsCell"><div>${awaySpread}</div><div data-testid="OddsCellBottom">-110</div></div></a>
    <a aria-label="total -110"><div data-testid="OddsCell"><div>o${total}</div><div data-testid="OddsCellBottom">-110</div></div></a>
    <a href="/nba/team/_/name/${home}/team"></a>
    <a aria-label="pointSpread -110"><div data-testid="OddsCell"><div>${homeSpread}</div><div data-testid="OddsCellBottom">-110</div></div></a>
    <a aria-label="total -110"><div data-testid="OddsCell"><div>u${total}</div><div data-testid="OddsCellBottom">-110</div></div></a>
  </div>`;
}

const espnHtml = `<div data-testid="betSixPackTable">${espnCard("2026-11-03T00:00Z", "okc", "cle", "+4.5", "-4.5", "229.5")}${espnCard("2026-12-25T17:00Z", "ny", "wsh", "+1.5", "-1.5", "220")}</div>`;

test("history stores a typed line and leaves out a player with no line", () => {
  const gameId = "2026-11-02|TOR@LAL";
  const luka: Player = { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON };
  const reaves: Player = { playerId: "reavesau01", displayName: "Austin Reaves", teamId: "LAL", position: "SG", season: CURRENT_SEASON };
  const start = {
    ...emptyDatabase(),
    players: [luka, reaves],
    games: [{ gameId, season: CURRENT_SEASON, gameDate: "2026-11-02", homeTeamId: "LAL", awayTeamId: "TOR", status: "scheduled" as const }],
    vegas: [
      { gameId, teamId: "LAL", season: CURRENT_SEASON, spread: -3.5, total: 220, sourceTimestamp: retrievedAt },
      { gameId, teamId: "TOR", season: CURRENT_SEASON, spread: 3.5, total: 220, sourceTimestamp: retrievedAt },
    ],
    projections: [luka, reaves].map((player) => ({
      playerId: player.playerId,
      gameId,
      source: "sportsline",
      season: CURRENT_SEASON,
      points: player.playerId === luka.playerId ? 32 : 16,
      rebounds: 8,
      minutes: 36,
      sourceTimestamp: retrievedAt,
    })),
  };
  const typed = setPropLine(start, luka.playerId, gameId, "points", 24.5, retrievedAt);
  assert.equal(typed.stored, true);
  assert.equal(typed.db.pregame.length, 1);
  assert.equal(typed.db.pregame[0]?.playerId, luka.playerId);
  assert.equal(typed.db.pregame[0]?.line, 24.5);
  const savedBoard = buildSlate(typed.db, "2026-11-02");
  const savedLuka = savedBoard.rows.find((row) => row.playerId === luka.playerId);
  const openReaves = savedBoard.rows.find((row) => row.playerId === reaves.playerId);
  assert.equal(savedBoard.games[0]?.label, "TOR at LAL");
  assert.equal(savedBoard.games[0]?.spread, -3.5);
  assert.equal(savedBoard.games[0]?.total, 220);
  assert.equal(savedLuka?.stats.points.source, "saved");
  assert.equal(savedLuka?.stats.points.line, 24.5);
  assert.equal(savedLuka?.stats.points.edge, (savedLuka?.stats.points.projection ?? 0) - 24.5);
  assert.equal(openReaves?.stats.points.source, "preview");
  assert.equal(openReaves?.stats.points.savedAt, null);
  assert.equal(openReaves?.stats.points.line, null);
  const ran = applyModelRun(typed.db, "2026-11-02", retrievedAt);
  assert.equal(ran.db.pregame.some((row) => row.playerId === reaves.playerId), false);
  assert.equal(ran.db.pregame.filter((row) => row.playerId === luka.playerId).length, 1);
  const cleared = setPropLine(ran.db, luka.playerId, gameId, "points", null, retrievedAt);
  assert.equal(cleared.db.pregame.length, 0);
  assert.equal(cleared.db.lines.length, 0);
  const clearedBoard = buildSlate(cleared.db, "2026-11-02");
  assert.equal(clearedBoard.rows.find((row) => row.playerId === luka.playerId)?.stats.points.source, "preview");
  assert.equal(clearedBoard.rows.find((row) => row.playerId === luka.playerId)?.stats.points.savedAt, null);
});

test("lines replace a typed number before the game and leave it after actuals", () => {
  const gameId = "2026-11-02|TOR@LAL";
  const player: Player = { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON };
  const start = {
    ...emptyDatabase(),
    players: [player],
    games: [{ gameId, season: CURRENT_SEASON, gameDate: "2026-11-02", homeTeamId: "LAL", awayTeamId: "TOR", status: "scheduled" as const }],
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
  const typed = setPropLine(start, player.playerId, gameId, "points", 24.5, retrievedAt);
  assert.equal(typed.stored, true);
  assert.equal(typed.db.lines[0]?.source, "manual");
  const probe: ProbeResult = {
    state: "parsed",
    message: "ok",
    calls: [],
    events: [{ id: "10", home: "LAL", away: "TOR" }],
    offers: [{ eventId: "10", playerId: "55", name: "Luka Doncic", marketId: 156, line: 22.5, overOdds: -110, underOdds: -105 }],
    furtherPages: 0,
  };
  const loaded = applyBettingProsProbe(typed.db, "2026-11-02", probe, retrievedAt);
  assert.equal(loaded.db.lines.find((line) => line.stat === "points")?.line, 22.5);
  assert.equal(loaded.db.lines.find((line) => line.stat === "points")?.source, "bettingpros");
  const savedProjection = typed.db.pregame[0]?.projection;
  const closed = applyBettingProsProbe({
    ...typed.db,
    actuals: [{
      playerId: player.playerId,
      gameId,
      season: CURRENT_SEASON,
      dnp: false,
      points: 30,
      rebounds: 8,
      sourceTimestamp: retrievedAt,
    }],
  }, "2026-11-02", probe, retrievedAt);
  assert.equal(closed.db.lines.find((line) => line.stat === "points")?.line, 24.5);
  assert.equal(closed.db.lines.find((line) => line.stat === "points")?.source, "manual");
  const graded = applyModelRun(closed.db, "2026-11-02", retrievedAt);
  assert.equal(graded.db.pregame[0]?.line, 24.5);
  assert.equal(graded.db.pregame[0]?.projection, savedProjection);
  const cleared = setPropLine(loaded.db, player.playerId, gameId, "points", null, retrievedAt);
  assert.equal(cleared.db.lines.length, 0);
  assert.equal(cleared.db.pregame.length, 0);
});

test("espn odds page supplies the home spread and the total", () => {
  const parsed = parseEspnOdds(espnHtml, "2026-11-02");
  assert.equal(parsed.parsed, true);
  assert.equal(parsed.games.length, 1);
  assert.deepEqual(parsed.games[0], { away: "OKC", home: "CLE", spread: -4.5, total: 229.5, tip: "2026-11-03T00:00Z" });
  const stored = applyEspnOdds(emptyDatabase(), "2026-11-02", parsed.games, retrievedAt);
  assert.equal(stored.db.games.find((row) => row.homeTeamId === "CLE")?.tipAt, "2026-11-03T00:00Z");
  const kept = applyBettingProsProbe(stored.db, "2026-11-02", {
    state: "parsed",
    message: "ok",
    calls: [],
    events: [{ id: "10", home: "CLE", away: "OKC" }],
    offers: [],
    furtherPages: 0,
  }, retrievedAt);
  assert.equal(kept.db.games.find((row) => row.homeTeamId === "CLE")?.tipAt, "2026-11-03T00:00Z");
  assert.equal(stored.db.vegas.find((row) => row.teamId === "CLE")?.spread, -4.5);
  assert.equal(stored.db.vegas.find((row) => row.teamId === "OKC")?.spread, 4.5);
  assert.equal(stored.db.vegas[0]?.total, 229.5);
  const christmas = parseEspnOdds(espnHtml, "2026-12-25");
  assert.equal(christmas.games.length, 1);
  assert.equal(christmas.games[0]?.away, "NYK");
  assert.equal(christmas.games[0]?.home, "WAS");
});

test("the first failed source stops the click and does not save today's slate", async () => {
  const previous = process.env.BETTINGPROS_API_KEY;
  process.env.BETTINGPROS_API_KEY = "test-key";
  const espnPage = async () => espnHtml;
  try {
    const oddsUrls: string[] = [];
    const oddsDown = await collectProjectionSources("2026-11-02", retrievedAt, async (url) => {
      oddsUrls.push(url);
      if (url.includes("espn.com")) return { ok: false, status: 429, text: async () => "" };
      return { ok: true, status: 200, text: async () => "2026-27" };
    });
    assert.equal(oddsDown.ok, false);
    if (!oddsDown.ok) {
      assert.equal(oddsDown.source, "ESPN odds");
      assert.match(oddsDown.detail, /429/);
    }
    assert.equal(oddsUrls.length, 1);
    assert.equal(oddsUrls.some((url) => url.includes("bettingpros") || url.includes("/events")), false);
    const kept = commitProjections(emptyDatabase(), "2026-11-02", oddsDown);
    assert.equal(kept.db, undefined);
    assert.match(kept.message, /Today's slate was not saved/);

    const urls: string[] = [];
    const usageDown = await collectProjectionSources("2026-11-02", retrievedAt, async (url) => {
      urls.push(url);
      if (url.includes("espn.com")) return { ok: true, status: 200, text: espnPage };
      if (url.includes("NBA_2027_advanced")) return { ok: false, status: 429, text: async () => "" };
      return { ok: true, status: 200, text: async () => "2026-27" };
    });
    assert.equal(usageDown.ok, false);
    if (!usageDown.ok) assert.equal(usageDown.source, "Basketball Reference usage");
    assert.equal(urls.some((url) => url.includes("per_game")), false);
    assert.equal(urls.some((url) => url.includes("/events")), false);
    assert.equal(urls.some((url) => url.includes("sportsline")), false);
    assert.equal(urls.some((url) => url.includes("hashtagbasketball")), false);

    const hollow = await collectProjectionSources("2026-11-02", retrievedAt, async (url) => {
      if (url.includes("espn.com")) return { ok: true, status: 200, text: espnPage };
      return { ok: true, status: 200, text: async () => "2026-27" };
    });
    assert.equal(hollow.ok, true);
    if (hollow.ok) {
      const unsaved = commitProjections(emptyDatabase(), "2026-11-02", hollow);
      assert.equal(unsaved.db, undefined);
      assert.match(unsaved.message, /pace/);
      assert.match(unsaved.message, /not saved/);
    }

    const lineUrls: string[] = [];
    const linesDown = await collectLines("2026-11-02", async (url) => {
      lineUrls.push(url);
      if (url.includes("/events")) return { ok: false, status: 429, text: async () => "" };
      return { ok: true, status: 200, text: async () => "" };
    });
    assert.equal(linesDown.state, "error");
    assert.equal(lineUrls.some((url) => url.includes("espn.com") || url.includes("sportsline")), false);
    const unchanged = commitLines(emptyDatabase(), "2026-11-02", linesDown, retrievedAt);
    assert.equal(unchanged.db, undefined);
    assert.match(unchanged.message, /not changed/);
  } finally {
    if (previous == null) delete process.env.BETTINGPROS_API_KEY;
    else process.env.BETTINGPROS_API_KEY = previous;
  }
});

test("a missing Dimers round does not stop the search for the slate", async () => {
  const plan = probeRoundNumbers([
    { year: 2026, round: 14, date: "2026-11-02" },
    { year: 2026, round: 16, date: "2026-11-04" },
    { year: 2026, round: 18, date: "2026-11-06" },
  ], "2026-11-04", 2026);
  assert.deepEqual(plan.window, [15, 16, 17]);
  const calls: string[] = [];
  const sportslineHtml = `<table><thead><tr>
    <th id="PLAYER">PLAYER</th><th id="TEAM">TEAM</th><th id="GAME">GAME</th>
    <th id="PTS">PTS</th><th id="MIN">MIN</th><th id="TRB">TRB</th>
  </tr></thead><tbody><tr>
    <td>Luka Doncic</td><td>LAL</td><td>TOR@LAL</td><td>32.3</td><td>36</td><td>8</td>
  </tr></tbody></table>`;
  const box = JSON.stringify([{
    MatchData: {
      Date: "2026-11-05T02:30:00Z",
      AwayTeam: { Abv: "TOR" },
      HomeTeam: { Abv: "LAL" },
    },
    projBoxScore: {
      away: [],
      home: [{ first_name: "Luka", last_name: "Doncic", points: 20, rebounds: 6 }],
    },
  }]);
  const loaded = await fetchDimersSlate("2026-11-04", sportslineHtml, [], async (url) => {
    calls.push(url);
    if (url.includes("/round/options")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([
          { Year: 2026, Round_Number: 14, Round_Date: "2026-11-02" },
          { Year: 2026, Round_Number: 16, Round_Date: "2026-11-04" },
        ]),
      };
    }
    if (url.includes("Round=15")) return { ok: false, status: 404, text: async () => "" };
    if (url.includes("Round=16")) return { ok: true, status: 200, text: async () => box };
    return { ok: false, status: 404, text: async () => "" };
  });
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.round, 16);
    assert.equal(loaded.players[0]?.points, 20);
    assert.equal(loaded.players[0]?.rebounds, 6);
    assert.equal(loaded.players[0]?.name, "Luka Doncic");
  }
  const round15 = calls.findIndex((url) => url.includes("Round=15"));
  const round16 = calls.findIndex((url) => url.includes("Round=16"));
  assert.ok(round15 >= 0 && round16 > round15);

  const matched = applyPublicPages(emptyDatabase(), "2026-11-04", bundle({
    actuals: page("<table></table>"),
    sportsline: page(sportslineHtml),
    dimers: loaded.ok ? loaded : { ok: false, error: "missing" },
  }));
  const slate = buildSlate(matched.db, "2026-11-04");
  const row = slate.rows.find((item) => item.playerId === "doncilu01");
  assert.equal(row?.stats.points.baseline, 32.3 * 0.65 + 20 * 0.35);
  assert.equal(row?.stats.points.adjustments.find((item) => item.key === "sportsline")?.input, 32.3);
  assert.equal(row?.stats.rebounds.adjustments.find((item) => item.key === "dimers")?.input, 6);
  assert.match(row?.stats.rebounds.adjustments.find((item) => item.key === "dimers")?.detail ?? "", /65\/35/);

  const missed = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    actuals: page("<table></table>"),
    dimers: { ok: true, round: 16, season: 2026, players: [] },
  }));
  const missedLuka = buildSlate(missed.db, "2026-11-02").rows.find((item) => item.playerId === "doncilu01");
  assert.equal(missedLuka?.stats.points.baseline, 32.3);
  assert.match(missedLuka?.stats.points.flags.join(" ") ?? "", /Dimers points are missing/);
  assert.match(missedLuka?.stats.rebounds.flags.join(" ") ?? "", /Dimers rebounds are missing/);
});

test("a failed Dimers fetch keeps the SportsLine baseline and notes the miss", async () => {
  const pages = bundle();
  const urls: string[] = [];
  const collected = await collectProjectionSources("2026-11-02", retrievedAt, async (url) => {
    urls.push(url);
    if (url.includes("round/options") || url.includes("round/boxscores")) return { ok: false, status: 503, text: async () => "" };
    if (url.includes("espn.com")) return { ok: true, status: 200, text: async () => espnHtml };
    if (url.includes("NBA_2027_advanced")) return { ok: true, status: 200, text: async () => pages.advanced.ok ? pages.advanced.html : "" };
    if (url.includes("per_game")) return { ok: true, status: 200, text: async () => pages.perGame.ok ? pages.perGame.html : "" };
    if (url.includes("dailyleaders")) return { ok: true, status: 200, text: async () => "<table></table>" };
    if (url.includes("NBA_2027.html")) return { ok: true, status: 200, text: async () => pages.pace.ok ? pages.pace.html : "" };
    if (url.includes("sportsline")) return { ok: true, status: 200, text: async () => pages.sportsline.ok ? pages.sportsline.html : "" };
    if (url === FANTASYPROS_DVP_URL) return { ok: true, status: 200, text: async () => pages.fantasypros.ok ? pages.fantasypros.html : "" };
    if (url === TEAMRANKINGS_OPP_REBOUNDS_URL) return { ok: true, status: 200, text: async () => pages.teamrankings.ok ? pages.teamrankings.html : "" };
    return { ok: false, status: 404, text: async () => "" };
  });
  assert.equal(collected.ok, true);
  assert.equal(urls.some((url) => url.includes("bettingpros") || url.includes("/events")), false);
  assert.equal(urls.includes(FANTASYPROS_DVP_URL), true);
  assert.equal(urls.includes(TEAMRANKINGS_OPP_REBOUNDS_URL), true);
  assert.equal(urls.some((url) => url.includes("hashtagbasketball")), false);
  assert.equal(urls.some((url) => url.includes("round/options")), true);
  if (!collected.ok) return;
  assert.equal(collected.fetched.dimers?.ok, false);
  const seeded = emptyDatabase();
  seeded.projections.push({
    playerId: "doncilu01",
    gameId: "2026-11-02|TOR@LAL",
    source: "dimers",
    season: CURRENT_SEASON,
    points: 99,
    rebounds: 99,
    minutes: null,
    sourceTimestamp: retrievedAt,
  });
  const committed = commitProjections(seeded, "2026-11-02", collected);
  assert.ok(committed.db);
  assert.match(committed.message, /Dimers did not load/);
  assert.match(committed.message, /SportsLine stays the baseline/);
  assert.equal(committed.db?.projections.some((row) => row.source === "dimers"), false);
  const sportsline = committed.db?.projections.find((row) => row.source === "sportsline");
  assert.equal(sportsline?.points, 32.3);
  const slate = buildSlate(committed.db ?? emptyDatabase(), "2026-11-02");
  const luka = slate.rows.find((row) => row.playerId === "doncilu01");
  assert.equal(luka?.stats.points.baseline, 32.3);
  assert.equal(luka?.stats.points.adjustments.some((row) => row.key === "dimers"), false);
});

test("teamrankings blends opponent rebounds 85 percent season and 15 percent last 3", () => {
  assert.equal(teamFromLabel("Portland"), "POR");
  assert.equal(teamFromLabel("Okla City"), "OKC");
  assert.equal(teamFromLabel("LA Clippers"), "LAC");
  assert.equal(teamFromLabel("LA Lakers"), "LAL");
  assert.equal(teamFromLabel("NOR"), "NOP");
  const html = teamRankingsHtml([
    ["Portland", "47.0", "50.7"],
    ["Houston", "40.0", "40.0"],
  ]);
  const parsed = parseTeamRankingsOppRebounds(html);
  const portland = parsed.find((row) => row.team === "POR");
  assert.equal(portland?.season, 47);
  assert.equal(portland?.last3, 50.7);
  const blend = weightedOppReboundDiff(47, 50.7, 0);
  assert.equal(blend, 47 * 0.85 + 50.7 * 0.15);
  const diffs = opponentReboundDiffs(parsed.map((row) => ({ teamId: row.team, season: row.season, last3: row.last3 })));
  const league = (blend + 40) / 2;
  assert.equal(diffs.find((row) => row.teamId === "POR")?.reboundDiff, weightedOppReboundDiff(47, 50.7, league));

  const sportslineHtml = `<table><thead><tr>
    <th id="PLAYER">PLAYER</th><th id="TEAM">TEAM</th><th id="GAME">GAME</th>
    <th id="PTS">PTS</th><th id="MIN">MIN</th><th id="TRB">TRB</th>
  </tr></thead><tbody><tr>
    <td>Luka Doncic</td><td>LAL</td><td>LAL@POR</td><td>32.3</td><td>36</td><td>8</td>
  </tr></tbody></table>`;
  const applied = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    sportsline: page(sportslineHtml),
    actuals: page("<table></table>"),
    teamrankings: page(html),
  }));
  assert.equal(applied.messages.some((item) => item.level === "error"), false);
  const slate = buildSlate(applied.db, "2026-11-02");
  const luka = slate.rows.find((row) => row.playerId === "doncilu01");
  const term = luka?.stats.rebounds.adjustments.find((row) => row.key === "opp_rebounds");
  assert.equal(term?.status, "applied");
  assert.equal(term?.delta, weightedOppReboundDiff(47, 50.7, league) / 10);
  assert.match(term?.detail ?? "", /league blend/);
});

test("fantasypros blends last 30 at 30 percent and last 15 at 70 percent", () => {
  const html = fanduelHtml([
    { window: "GC-30", abbr: "tor", pos: "PG", points: "30", rebounds: "10" },
    { window: "GC-15", abbr: "tor", pos: "PG", points: "20", rebounds: "6" },
    { window: "GC-30", abbr: "bos", pos: "PG", points: "10", rebounds: "4" },
    { window: "GC-15", abbr: "bos", pos: "PG", points: "10", rebounds: "2" },
  ]);
  const parsed = parseFanduelDefense(html);
  assert.equal(parsed.l30.find((row) => row.team === "TOR")?.points, 30);
  assert.equal(parsed.l15.find((row) => row.team === "TOR")?.rebounds, 6);
  const diffs = defenseVsPosition(
    parsed.l30.map((row) => ({ teamId: row.team, position: row.position, points: row.points, rebounds: row.rebounds })),
    parsed.l15.map((row) => ({ teamId: row.team, position: row.position, points: row.points, rebounds: row.rebounds })),
  );
  const tor = diffs.find((row) => row.teamId === "TOR");
  const points30 = 30 - 20;
  const points15 = 20 - 15;
  assert.equal(points30 * 0.3 + points15 * 0.7, weightedDvp(points30, points15));
  assert.equal(tor?.pointsDiff, weightedDvp(points30, points15));
  assert.equal(tor?.pointsWindow, "both");
  assert.equal(tor?.reboundsDiff, weightedDvp(10 - 7, 6 - 4));
  assert.equal(tor?.reboundsWindow, "both");
});

test("a missing fantasypros window uses the window that exists and notes it", () => {
  const html = fanduelHtml([
    { window: "GC-15", abbr: "tor", pos: "PG", points: "20", rebounds: "8" },
    { window: "GC-15", abbr: "bos", pos: "PG", points: "10", rebounds: "4" },
  ]);
  const parsed = parseFanduelDefense(html);
  assert.equal(parsed.l30.length, 0);
  assert.equal(parsed.l15.length, 2);
  const applied = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({
    fantasypros: page(html),
    actuals: page("<table></table>"),
  }));
  const tor = applied.db.dvp.find((row) => row.teamId === "TOR" && row.position === "PG");
  assert.equal(tor?.pointsDiff, 5);
  assert.equal(tor?.reboundsDiff, 2);
  assert.equal(tor?.pointsWindow, "l15");
  assert.equal(dvpWindowNote(tor?.pointsWindow), "Last 30 was missing. Last 15 is the defense vs position number.");
  const slate = buildSlate(applied.db, "2026-11-02");
  const luka = slate.rows.find((row) => row.playerId === "doncilu01");
  const points = luka?.stats.points.adjustments.find((row) => row.key === "dvp");
  const rebounds = luka?.stats.rebounds.adjustments.find((row) => row.key === "dvp");
  assert.equal(points?.status, "applied");
  assert.equal(points?.delta, 5 / 2);
  assert.match(points?.detail ?? "", /Last 30 was missing/);
  assert.match(points?.detail ?? "", /Last 15 is the defense vs position number/);
  assert.equal(rebounds?.delta, 2 / 2);
  assert.match(rebounds?.detail ?? "", /Last 30 was missing/);
});
