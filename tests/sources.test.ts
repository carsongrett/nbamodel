import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CURRENT_SEASON, emptyDatabase, type Player } from "../lib/engine.ts";
import { applyPublicPages, stripSample, type FetchedPage, type PublicFetch } from "../lib/sources/apply.ts";
import { applyBettingProsProbe } from "../lib/sources/apply-bettingpros.ts";
import { fetchBettingProsDay, type ProbeResult } from "../lib/sources/bettingpros.ts";
import { parseEnvText, readProjectEnv } from "../lib/sources/env-file.ts";
import { parseSportsLine } from "../lib/sources/parsers.ts";
import { canonicalTeam } from "../lib/sources/teams.ts";

const retrievedAt = "2026-11-02T18:00:00.000Z";

function page(html: string): FetchedPage {
  return { url: "https://example.test", ok: true, html };
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
    hashtag: page(`2026-27<table id="ContentPlaceHolder1_GridView1"><tr>
      <td>PG</td><td><span id="Label1">LAL</span></td><td><span id="Label2">20</span></td><td>1</td><td>1</td><td>1</td><td><span id="Label6">4</span></td>
    </tr><tr>
      <td>PG</td><td><span id="Label1b">BOS</span></td><td><span id="Label2b">30</span></td><td>1</td><td>1</td><td>1</td><td><span id="Label6b">8</span></td>
    </tr></table>`),
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
  assert.equal(canonicalTeam("TOT"), null);
  assert.equal(canonicalTeam("Lakers"), null);
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
    const line = marketId === 157 ? 8.5 : marketId === 336 ? 30.5 : 22.5;
    return { ok: true, status: 200, text: async () => offerBody(marketId, pageNumber, 2, line) };
  });
  assert.equal(urls.filter((url) => url.includes("page=2")).length, 3);
  assert.equal(urls.some((url) => url.includes("page=3")), false);
  assert.equal(urls.filter((url) => url.includes("market_id=156")).length, 2);
  assert.equal(urls.filter((url) => url.includes("market_id=157")).length, 2);
  assert.equal(urls.filter((url) => url.includes("market_id=336")).length, 2);
  assert.equal(urls[1]?.includes("page="), false);
  assert.equal(day.state, "parsed");
  assert.equal(day.calls.join(" ").includes("test-key"), false);

  const player: Player = { playerId: "doncilu01", displayName: "Luka Doncic", teamId: "LAL", position: "PG", season: CURRENT_SEASON };
  const named = applyBettingProsProbe({ ...emptyDatabase(), players: [player] }, "2026-11-02", day, retrievedAt);
  assert.equal(named.db.lines.length, 3);
  assert.equal(named.db.lines.find((line) => line.stat === "points")?.line, 22.5);
  assert.equal(named.db.lines.find((line) => line.stat === "rebounds")?.line, 8.5);
  assert.equal(named.db.lines.find((line) => line.stat === "points_rebounds")?.line, 30.5);
  assert.equal(named.db.idMap.find((item) => item.source === "bettingpros")?.canonicalId, "doncilu01");
  assert.equal(named.db.vegas.find((row) => row.teamId === "LAL")?.spread, -3.5);
  const repeat = applyBettingProsProbe(named.db, "2026-11-02", day, retrievedAt);
  assert.equal(repeat.db.lines.length, 3);

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
  await fetchBettingProsDay("2026-11-02", async (url) => {
    stuck.push(url);
    if (url.includes("/events")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ events: [{ id: 10, home: "LAL", visitor: "TOR" }] }) };
    }
    const marketId = Number(new URL(url).searchParams.get("market_id"));
    return { ok: true, status: 200, text: async () => offerBody(marketId, 1, 5, 10) };
  });
  assert.equal(stuck.filter((url) => url.includes("page=2")).length, 3);
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

  if (previous == null) delete process.env.BETTINGPROS_API_KEY;
  else process.env.BETTINGPROS_API_KEY = previous;
  assert.equal(failed("down").ok, false);
});
