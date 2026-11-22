import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_SEASON, emptyDatabase } from "../lib/engine.ts";
import { researchSlate } from "../lib/research.ts";

const ENV_KEYS = ["RESEARCH_PROVIDER", "RESEARCH_API_KEY", "RESEARCH_API_BASE_URL", "RESEARCH_MODEL", "RESEARCH_WEB_TOOL"] as const;

test("research slate asks for a player name and fills ids from the roster", async () => {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  process.env.RESEARCH_PROVIDER = "openai";
  process.env.RESEARCH_API_KEY = "test-key";
  process.env.RESEARCH_API_BASE_URL = "https://research.invalid/v1";
  process.env.RESEARCH_MODEL = "test-model";
  process.env.RESEARCH_WEB_TOOL = "web_search";
  const requests: { url: string; body: { model?: string; input?: string; tools?: { type: string }[] } }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as { model?: string; input?: string; tools?: { type: string }[] },
    });
    const notes = [
      {
        player_name: "Luka Doncic",
        source_url: "https://example.com/luka-out",
        summary: "Luka is out with an ankle injury.",
        kind: "verified",
        availability: "out",
        suggested_minutes: 0,
      },
      {
        player_name: "Off Day",
        player_id: "player_luka",
        source_url: "https://example.com/off",
        summary: "Off Day is questionable.",
        kind: "verified",
        availability: "questionable",
      },
      {
        player_id: "player_luka",
        source_url: "https://example.com/id-only",
        summary: "Id only, no name.",
        kind: "verified",
        availability: "available",
      },
    ];
    return new Response(JSON.stringify({ output_text: "```json\n" + JSON.stringify(notes) + "\n```" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const db = emptyDatabase();
    db.players = [
      { playerId: "player_luka", displayName: "Luka Doncic", teamId: "DAL", position: "PG", season: CURRENT_SEASON },
      { playerId: "player_kyrie", displayName: "Kyrie Irving", teamId: "DAL", position: "PG", season: CURRENT_SEASON },
      { playerId: "player_off", displayName: "Off Day", teamId: "MIA", position: "SF", season: CURRENT_SEASON },
    ];
    db.games = [{
      gameId: "g1",
      season: CURRENT_SEASON,
      gameDate: "2026-11-01",
      homeTeamId: "BOS",
      awayTeamId: "DAL",
      status: "scheduled",
    }];
    const result = await researchSlate(db, "2026-11-01", "2026-11-01T18:00:00.000Z");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://research.invalid/v1/responses");
    assert.equal(requests[0].body.model, "test-model");
    assert.deepEqual(requests[0].body.tools, [{ type: "web_search" }]);
    const prompt = requests[0].body.input ?? "";
    assert.match(prompt, /Luka Doncic \| DAL/);
    assert.match(prompt, /Kyrie Irving \| DAL/);
    assert.doesNotMatch(prompt, /Off Day/);
    assert.doesNotMatch(prompt, /player_luka/);
    assert.doesNotMatch(prompt, /player_kyrie/);
    assert.doesNotMatch(prompt, /Copy player_id/);
    assert.doesNotMatch(prompt, /Never guess/);
    assert.match(prompt, /player_name/);
    assert.match(prompt, /injury, a rotation note, or a minutes restriction/);
    assert.match(prompt, /real http or https source/);
    assert.match(prompt, /A player id is not required/);
    assert.match(prompt, /untrusted data/);
    assert.match(prompt, /Do not invent URLs/);
    assert.match(prompt, new RegExp(CURRENT_SEASON));
    assert.match(prompt, /Suggested minutes are notes/);
    assert.equal(result.status, "ok");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].playerId, "player_luka");
    assert.equal(result.findings[0].teamId, "DAL");
    assert.equal(result.findings[0].summary, "Luka is out with an ankle injury.");
    assert.equal(result.findings[0].sourceUrl, "https://example.com/luka-out");
    assert.match(result.message, /Off Day/);
    assert.match(result.message, /matched nobody/);
    assert.match(result.message, /without a player name/);
    assert.equal(result.db.research.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
