import assert from "node:assert/strict";
import test from "node:test";
import { buildSlate, emptyDatabase, type HomeworkStory } from "../lib/engine.ts";
import type { HomeworkRow } from "../lib/homework.ts";
import { acceptStories, replaceHomeworkStories, requestHomeworkStories, rowsForStory } from "../lib/homework-story.ts";

const ENV_KEYS = ["RESEARCH_PROVIDER", "RESEARCH_API_KEY", "RESEARCH_API_BASE_URL", "RESEARCH_MODEL", "RESEARCH_WEB_TOOL"] as const;
const DATE = "2026-11-14";
const SAVED = "2026-11-14T04:00:00.000Z";

function row(extra: Partial<HomeworkRow> = {}): HomeworkRow {
  return {
    playerId: extra.playerId ?? "acuffda01",
    gameId: extra.gameId ?? "g1",
    playerName: extra.playerName ?? "Darius Acuff Jr.",
    teamId: extra.teamId ?? "SAC",
    opponentId: extra.opponentId ?? "POR",
    stat: extra.stat ?? "points",
    statLabel: extra.statLabel ?? "Points",
    projection: extra.projection ?? 28,
    line: extra.line ?? 24.5,
    delta: extra.delta ?? 3.5,
    role: extra.role ?? null,
    injury: extra.injury ?? null,
    last5: extra.last5 === undefined ? "Min 36.8, 42.5, 33.5, 39.4, 39.9 · Pts 25, 22, 22, 32, 29" : extra.last5,
    note: extra.note ?? null,
  };
}

function withResearchEnv(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    process.env.RESEARCH_PROVIDER = "openai";
    process.env.RESEARCH_API_KEY = "test-key";
    process.env.RESEARCH_API_BASE_URL = "https://research.invalid/v1";
    process.env.RESEARCH_MODEL = "test-model";
    process.env.RESEARCH_WEB_TOOL = "web_search";
    try {
      await run();
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of ENV_KEYS) {
        if (previous[key] == null) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  };
}

test("one call asks why tonight might differ and keeps only a sourced story", withResearchEnv(async () => {
  const eight = [
    row(),
    row({
      playerId: "sabondo01",
      playerName: "Domantas Sabonis",
      stat: "rebounds",
      statLabel: "Rebounds",
      line: 12.5,
      delta: -2.4,
      last5: "Reb 14, 11, 9",
    }),
  ];
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const notes = [
      {
        player_name: "Darius Acuff Jr.",
        stat: "points",
        sentences: [
          "Fox is listed out, so the starting guard minutes sit with Acuff.",
          "Portland has been switching the smaller guard onto him.",
        ],
        source_urls: ["https://example.com/acuff-fox"],
      },
      {
        player_name: "Domantas Sabonis",
        stat: "rebounds",
        sentences: ["Sabonis is probable and no sourced change from the recent games turned up."],
      },
      {
        player_name: "Nobody Else",
        stat: "points",
        sentences: ["This player is not on the homework list."],
        source_urls: ["https://example.com/nobody"],
      },
    ];
    return new Response(JSON.stringify({ output_text: "```json\n" + JSON.stringify(notes) + "\n```" }), { status: 200 });
  };

  const stories = await requestHomeworkStories(eight, DATE, SAVED);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://research.invalid/v1/responses");
  const body = JSON.parse(String(requests[0].init?.body)) as { model?: string; tools?: { type: string }[]; input?: string };
  assert.equal(body.model, "test-model");
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
  const prompt = body.input ?? "";
  assert.match(prompt, /why tonight might differ from the recent games/);
  assert.match(prompt, /One to three sentences|one to three sentences/);
  assert.match(prompt, /Do not restate the line, the delta, or the last five/);
  assert.match(prompt, /Do not write a fact with no source/);
  assert.match(prompt, /Do not limit the search to injuries, rotation notes, or minutes restrictions/);
  assert.match(prompt, /teammate sitting/);
  assert.match(prompt, /Darius Acuff Jr\. \| SAC vs POR \| points/);
  assert.match(prompt, /Domantas Sabonis \| SAC vs POR \| rebounds/);
  assert.doesNotMatch(prompt, /acuffda01/);
  assert.doesNotMatch(prompt, /sabondo01/);
  assert.doesNotMatch(prompt, /24\.5/);
  assert.doesNotMatch(prompt, /\+3\.5/);
  assert.doesNotMatch(prompt, /test-key/);
  const header = new Headers(requests[0].init?.headers).get("authorization");
  assert.equal(header, `Bearer ${process.env.RESEARCH_API_KEY}`);
  assert.equal(stories?.length, 1);
  assert.equal(stories?.[0].playerId, "acuffda01");
  assert.equal(stories?.[0].stat, "points");
  assert.equal(stories?.[0].text, "Fox is listed out, so the starting guard minutes sit with Acuff. Portland has been switching the smaller guard onto him.");
  assert.equal(stories?.[0].sourceUrl, "https://example.com/acuff-fox");
  assert.equal(JSON.stringify(stories).includes("test-key"), false);
  assert.equal(JSON.stringify(stories).includes("probable and no sourced"), false);
}));

test("a failed call leaves previous stories in place", withResearchEnv(async () => {
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  const stories = await requestHomeworkStories([row()], DATE, SAVED);
  assert.equal(stories, null);
  const previous: HomeworkStory = {
    playerId: "acuffda01",
    gameId: "g1",
    stat: "points",
    slateDate: DATE,
    text: "Fox is out.",
    sourceUrl: "https://example.com/fox",
    savedAt: SAVED,
  };
  const db = emptyDatabase();
  db.homeworkStories = [previous];
  db.research = [{
    id: "finding-1",
    slateDate: DATE,
    playerId: "acuffda01",
    teamId: "SAC",
    sourceUrl: "https://example.com/note",
    publishedAt: null,
    retrievedAt: SAVED,
    summary: "Stored research note.",
    kind: "verified",
    availability: null,
    suggestedMinutes: null,
    suggestedRole: null,
    conflict: false,
    appliedAt: null,
    flags: [],
  }];
  const kept = stories == null ? db : replaceHomeworkStories(db, DATE, stories);
  assert.equal(kept.homeworkStories[0].text, "Fox is out.");
  assert.equal(kept.research[0].summary, "Stored research note.");
}));

test("unsourced, restated, and extra sentences are dropped or trimmed", () => {
  const acuff = row();
  const stories = acceptStories([
    {
      player_name: "Darius Acuff Jr.",
      stat: "points",
      sentences: ["The line is 24.5 and the recent list is repeated."],
      source_urls: ["https://example.com/line"],
    },
    {
      player_name: "Darius Acuff Jr.",
      stat: "points",
      sentences: [`Recent form: ${acuff.last5}`],
      source_urls: ["https://example.com/last"],
    },
    {
      player_name: "Darius Acuff Jr.",
      stat: "points",
      sentences: ["He is +3.5 against the number."],
      source_urls: ["https://example.com/delta"],
    },
    {
      player_name: "Darius Acuff Jr.",
      stat: "points",
      sentences: ["No link, so this fact stays off the row."],
    },
    {
      player_name: "Darius Acuff Jr.",
      stat: "points",
      sentences: [
        "Coach said the closing group changes.",
        "The second unit starts the second quarter.",
        "A third sentence still fits.",
        "A fourth sentence is left off.",
      ],
      source_url: "https://example.com/closing",
    },
  ], [acuff], DATE, SAVED);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].text, "Coach said the closing group changes. The second unit starts the second quarter. A third sentence still fits.");
  assert.equal(stories[0].text.includes("fourth"), false);
  assert.equal(stories[0].sourceUrl, "https://example.com/closing");
});

test("an empty homework list does not call OpenAI and a blank answer clears the date", withResearchEnv(async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ output_text: "[]" }), { status: 200 });
  };
  assert.deepEqual(await requestHomeworkStories([], DATE, SAVED), []);
  assert.equal(calls, 0);
  const cleared = await requestHomeworkStories([row()], DATE, SAVED);
  assert.deepEqual(cleared, []);
  assert.equal(calls, 1);
  const older: HomeworkStory = {
    playerId: "old",
    gameId: "old-game",
    stat: "rebounds",
    slateDate: "2026-11-13",
    text: "Yesterday's story stays.",
    sourceUrl: "https://example.com/yesterday",
    savedAt: SAVED,
  };
  const db = replaceHomeworkStories({ ...emptyDatabase(), homeworkStories: [older] }, DATE, cleared ?? []);
  assert.deepEqual(db.homeworkStories, [older]);
  const slate = buildSlate(db, "2026-11-13");
  assert.equal(slate.homeworkStories[0]?.text, "Yesterday's story stays.");
  assert.equal(JSON.stringify(slate.homeworkStories).includes("example.com"), false);
  assert.deepEqual(rowsForStory(emptyDatabase(), DATE), []);
}));
