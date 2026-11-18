import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, parseJsonTable } from "../lib/parse.ts";

test("csv keeps quoted commas and json accepts an object list", () => {
  const csv = parseCsv('player_id,display_name,season\nplayer_luka,"Doncic, Luka",2026-27\n');
  assert.equal(csv.rows[0].values.display_name, "Doncic, Luka");
  assert.equal(csv.rows[0].rowNumber, 2);
  const json = parseJsonTable('{"rows":[{"player_id":"player_luka","points":31.2}]}');
  assert.equal(json.rows[0].values.player_id, "player_luka");
  assert.equal(json.rows[0].values.points, "31.2");
  const bad = parseJsonTable("{");
  assert.match(bad.error ?? "", /parsed/);
});
