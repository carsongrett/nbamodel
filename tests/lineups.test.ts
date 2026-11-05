import assert from "node:assert/strict";
import test from "node:test";
import { fetchRotowireLineups, noteForPlayer, parseRotowireLineups, ROTOWIRE_LINEUPS_URL } from "../lib/sources/rotowire-lineups.ts";

const html = `
<div class="lineup is-nba is-tools is-picks">
  <div class="lineup__abbr">XXX</div>
  <ul class="lineup__list is-visit">
    <li class="lineup__player is-pct-play-100"><a title="Ignore Me" href="/basketball/player/x">Ignore</a></li>
  </ul>
</div>
<div class="lineup is-nba" data-lnum="1">
  <div class="lineup__abbr">PHI</div>
  <div class="lineup__abbr">DET</div>
  <ul class="lineup__list is-visit">
    <li class="lineup__status is-confirmed">
      <div class="dot is-medium is-green" style="margin-right:5px;"></div>Confirmed Lineup
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">PG</div>
      <a title="Tyrese Maxey" href="/basketball/player/tyrese-maxey-5158">Tyrese Maxey</a>
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">C</div>
      <a title="Nikola Jokić" href="/basketball/player/nikola-jokic">N. Jokic</a>
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">SF</div>
      <a title="Karl-Anthony Towns" href="/basketball/player/karl-anthony-towns">K. Towns</a>
    </li>
    <li><button class="see-proj-minutes" data-team="PHI">Projected Minutes</button></li>
    <li class="lineup__title is-middle">MAY NOT PLAY</li>
    <li class="lineup__player is-pct-play-0 has-injury-status hide is-ofs" title="Very Likely To Play">
      <div class="lineup__pos" style="width:15px;">C</div>
      <a title="Ariel Hukporti" href="/basketball/player/ariel-hukporti-5778">A. Hukporti</a>
      <span class="lineup__inj">OFS</span>
    </li>
    <li class="lineup__player is-pct-play-0 has-injury-status" title="Very Unlikely To Play">
      <div class="lineup__pos" style="width:15px;">C</div>
      <a title="Dominick Barlow" href="/basketball/player/dominick-barlow-5670">D. Barlow</a>
      <span class="lineup__inj">Out</span>
    </li>
    <li class="lineup__player is-pct-play-50 has-injury-status" title="Toss Up To Play">
      <div class="lineup__pos" style="width:15px;">G</div>
      <a title="Jordan Goodwin" href="/basketball/player/jordan-goodwin">J. Goodwin</a>
      <span class="lineup__inj">Ques</span>
    </li>
  </ul>
  <ul class="lineup__list is-home">
    <li class="lineup__status is-expected">
      <div class="dot is-medium is-yellow" style="margin-right:5px;"></div>Expected Lineup
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">PG</div>
      <a title="Cade Cunningham" href="/basketball/player/cade-cunningham">C. Cunningham</a>
    </li>
    <li class="lineup__player is-pct-play-75 has-injury-status" title="Likely To Play">
      <div class="lineup__pos">PF</div>
      <a title="Giannis Antetokounmpo" href="/basketball/player/giannis-antetokounmpo-3456">G. Antetokounmpo</a>
      <span class="lineup__inj">Prob</span>
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">PF</div>
      <a title="P.J. Washington" href="/basketball/player/pj-washington">P. Washington</a>
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">PF</div>
      <a title="Jaren Jackson Jr." href="/basketball/player/jaren-jackson">J. Jackson</a>
    </li>
    <li class="lineup__player is-pct-play-100" title="Very Likely To Play">
      <div class="lineup__pos">PG</div>
      <a title="De'Aaron Fox" href="/basketball/player/deaaron-fox">D. Fox</a>
    </li>
    <li class="lineup__title is-middle">MAY NOT PLAY</li>
    <li class="lineup__player is-pct-play-75 has-injury-status" title="Likely To Play">
      <div class="lineup__pos" style="width:15px;">F</div>
      <a title="Giannis Antetokounmpo" href="/basketball/player/giannis-antetokounmpo-3456">G. Antetokounmpo</a>
      <span class="lineup__inj">Prob</span>
    </li>
    <li class="lineup__player is-pct-play-0 has-injury-status" title="Very Unlikely To Play">
      <div class="lineup__pos" style="width:15px;">G</div>
      <a title="Gary Payton II" href="/basketball/player/gary-payton-ii">G. Payton</a>
      <span class="lineup__inj">Doubt</span>
    </li>
    <li class="lineup__player is-pct-play-0 has-injury-status" title="Very Unlikely To Play">
      <div class="lineup__pos" style="width:15px;">G</div>
      <a title="Gary Payton III" href="/basketball/player/gary-payton-iii">G. Payton</a>
      <span class="lineup__inj">Out</span>
    </li>
  </ul>
</div>
`;

test("lineup notes follow the five, the status, and the injury tag", () => {
  const teams = parseRotowireLineups(html);
  assert.deepEqual(teams.map((team) => team.teamId), ["PHI", "DET"]);
  assert.equal(teams[0]?.confirmed, true);
  assert.equal(teams[1]?.confirmed, false);
  assert.deepEqual(teams[0]?.players.filter((player) => player.role === "starter").map((player) => player.name), [
    "Tyrese Maxey",
    "Nikola Jokić",
    "Karl-Anthony Towns",
  ]);
  assert.equal(noteForPlayer(teams, "PHI", "Tyrese Maxey"), "Starting · confirmed");
  assert.equal(noteForPlayer(teams, "PHI", "Nikola Jokic"), "Starting · confirmed");
  assert.equal(noteForPlayer(teams, "PHI", "Karl Anthony Towns"), "Starting · confirmed");
  assert.equal(noteForPlayer(teams, "PHI", "Dominick Barlow"), "Bench · Out");
  assert.equal(noteForPlayer(teams, "PHI", "Ariel Hukporti"), "Bench · Out for season");
  assert.equal(noteForPlayer(teams, "PHI", "Jordan Goodwin"), "Bench · Questionable");
  assert.equal(noteForPlayer(teams, "DET", "Cade Cunningham"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "Giannis Antetokounmpo"), "Starting · Probable");
  assert.equal(noteForPlayer(teams, "DET", "PJ Washington"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "P. J. Washington"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "Jaren Jackson"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "Jaren Jackson Jr"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "DeAaron Fox"), "Starting");
  assert.equal(noteForPlayer(teams, "DET", "Gary Payton II"), "Bench · Doubtful");
  assert.equal(noteForPlayer(teams, "DET", "Gary Payton III"), "Bench · Out");
  assert.equal(noteForPlayer(teams, "DET", "Gary Payton"), null);
  assert.equal(noteForPlayer(teams, "PHI", "Joel Embiid"), null);
  assert.equal(noteForPlayer(teams, "LAL", "Tyrese Maxey"), null);
  assert.equal(noteForPlayer(teams, "PHI", "Ignore Me"), null);
});

test("a failed lineup fetch returns an error and no teams", async () => {
  const denied = await fetchRotowireLineups(async () => ({ ok: false, status: 403, text: async () => "" }));
  assert.deepEqual(denied, { ok: false, error: "Rotowire lineups returned HTTP 403." });
  const wall = await fetchRotowireLineups(async () => ({ ok: true, status: 200, text: async () => "<html>sign in</html>" }));
  assert.deepEqual(wall, { ok: false, error: "Rotowire lineups page did not include a lineup." });
  const down = await fetchRotowireLineups(async () => {
    throw new Error("network down");
  });
  assert.deepEqual(down, { ok: false, error: "network down" });
});

test("the lineup check requests only the public lineups page", async () => {
  const calls: string[] = [];
  const loaded = await fetchRotowireLineups(async (url) => {
    calls.push(url);
    assert.equal(url.includes("get-projected-minutes"), false);
    return { ok: true, status: 200, text: async () => html };
  });
  assert.deepEqual(calls, [ROTOWIRE_LINEUPS_URL]);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.teams.length, 2);
});
