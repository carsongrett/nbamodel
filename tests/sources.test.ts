import assert from "node:assert/strict";
import test from "node:test";
import { emptyDatabase } from "../lib/engine.ts";
import { applyPublicPages, type FetchedPage, type PublicFetch } from "../lib/sources/apply.ts";
import { applyBettingProsProbe } from "../lib/sources/apply-bettingpros.ts";
import { probeBettingPros } from "../lib/sources/bettingpros.ts";
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

test("public pages keep ids exact, skip a non-current season, and do not duplicate", () => {
  const first = applyPublicPages(emptyDatabase(), "2026-11-02", bundle());
  assert.equal(first.db.players.length, 1);
  assert.equal(first.db.players[0]?.playerId, "doncilu01");
  assert.equal(first.db.projections.length, 0);
  assert.match(first.messages.map((item) => item.message).join(" "), /Names were not matched/);
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

  const mapped = applyPublicPages({
    ...first.db,
    idMap: [...first.db.idMap, { source: "sportsline", entityType: "player", sourceId: "Luka Doncic", canonicalId: "doncilu01" }],
  }, "2026-11-02", bundle());
  assert.equal(mapped.db.projections.length, 1);
  assert.equal(mapped.db.projections[0]?.points, 32.3);
  assert.equal(mapped.db.projections[0]?.playerId, "doncilu01");
  const again = applyPublicPages(mapped.db, "2026-11-02", bundle());
  assert.equal(again.db.projections.length, 1);
  assert.equal(again.db.players.length, 1);
  assert.equal(again.db.actuals.length, 1);
  assert.equal(again.db.dvp.filter((row) => row.position === "PG").length, 2);

  const oldHtml = page("<table><tr><td data-stat=\"name_display\" data-append-csv=\"old1\">Old</td><td data-stat=\"team_name_abbr\">BOS</td><td data-stat=\"pos\">PG</td><td data-stat=\"usg_pct\">20</td><td data-stat=\"games\">10</td></tr></table>");
  const old = applyPublicPages(emptyDatabase(), "2026-11-02", bundle({ advanced: oldHtml, perGame: oldHtml }));
  assert.equal(old.db.players.length, 0);
  assert.match(old.messages.map((item) => item.message).join(" "), /not a 2026–27 page/);
});

test("bettingpros probe stops after one events call and one offers page", async () => {
  const previous = process.env.BETTINGPROS_API_KEY;
  delete process.env.BETTINGPROS_API_KEY;
  let calls = 0;
  const cold = await probeBettingPros("2026-11-02", async () => {
    calls += 1;
    throw new Error("should not be called");
  });
  assert.equal(cold.state, "setup_needed");
  assert.equal(calls, 0);

  process.env.BETTINGPROS_API_KEY = "test-key";
  const urls: string[] = [];
  const probed = await probeBettingPros("2026-11-02", async (url, init) => {
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
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        offers: [{
          event_id: 10,
          market_id: 156,
          player_id: 55,
          selections: [
            { selection: "over", books: [{ id: 0, lines: [{ line: 22.5, cost: -110 }] }] },
            { selection: "under", books: [{ id: 0, lines: [{ line: 22.5, cost: -105 }] }] },
          ],
        }],
        pagination: { page: 1, total_pages: 4 },
      }),
    };
  });
  assert.equal(urls.length, 2);
  assert.match(urls[0] ?? "", /\/events\?/);
  assert.match(urls[1] ?? "", /market_id=156/);
  assert.match(urls[1] ?? "", /book_id=0/);
  assert.equal(urls[1]?.includes("page="), false);
  assert.equal(probed.furtherPages, 3);
  assert.equal(probed.offers[0]?.line, 22.5);
  assert.equal(probed.calls.join(" ").includes("test-key"), false);

  const applied = applyBettingProsProbe(emptyDatabase(), "2026-11-02", probed, retrievedAt);
  assert.equal(applied.db.lines.length, 0);
  const linked = applyBettingProsProbe({
    ...applied.db,
    idMap: [{ source: "bettingpros", entityType: "player", sourceId: "55", canonicalId: "doncilu01" }],
  }, "2026-11-02", probed, retrievedAt);
  assert.equal(linked.db.lines.length, 1);
  assert.equal(linked.db.lines[0]?.line, 22.5);
  assert.equal(linked.db.lines[0]?.stat, "points");
  assert.equal(linked.db.vegas.find((row) => row.teamId === "LAL")?.spread, -3.5);
  const repeat = applyBettingProsProbe(linked.db, "2026-11-02", probed, retrievedAt);
  assert.equal(repeat.db.lines.length, 1);
  assert.equal(repeat.db.games.length, 1);

  if (previous == null) delete process.env.BETTINGPROS_API_KEY;
  else process.env.BETTINGPROS_API_KEY = previous;
  assert.equal(failed("down").ok, false);
});
