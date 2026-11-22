import assert from "node:assert/strict";
import test from "node:test";
import { highestDeltas, type HighestDeltaInput } from "../lib/highest-deltas";

function player(
  playerName: string,
  projection: number | null,
  line: number | null,
  teamId = "BOS",
  opponentId = "NYK",
): HighestDeltaInput {
  return {
    playerId: playerName.toLowerCase().replaceAll(" ", "-"),
    gameId: "g1",
    playerName,
    teamId,
    opponentId,
    projection,
    line,
  };
}

test("top 10 orders by absolute projection-minus-line and keeps the sign", () => {
  const rows = [
    player("Above small", 21, 20),
    player("Below big", 10, 22),
    player("Above mid", 30, 24),
    player("Below mid", 8, 14),
    player("Above big", 40, 25),
    player("Below small", 9, 10),
    player("Tie high A", 18, 10),
    player("Tie high B", 2, 10),
    player("Above four", 14, 10),
    player("Below five", 5, 10),
    player("Above three", 13, 10),
    player("Cut off", 10.5, 10),
    player("No line", 99, null),
    player("No projection", null, 20),
    player("Not a number", Number.NaN, 12),
    player("Other team", 50, 10, "LAL", "GSW"),
  ];

  const all = highestDeltas(rows);
  assert.deepEqual(all.map((row) => row.playerName), [
    "Other team",
    "Above big",
    "Below big",
    "Tie high A",
    "Tie high B",
    "Above mid",
    "Below mid",
    "Below five",
    "Above four",
    "Above three",
  ]);
  assert.equal(all.length, 10);
  assert.equal(all.find((row) => row.playerName === "Below big")?.delta, -12);
  assert.equal(all.find((row) => row.playerName === "Tie high B")?.delta, -8);
  assert.equal(all.find((row) => row.playerName === "Above big")?.delta, 15);
  assert.equal(all.some((row) => row.playerName === "No line"), false);
  assert.equal(all.some((row) => row.playerName === "Cut off"), false);

  const boston = highestDeltas(rows, "BOS");
  assert.deepEqual(boston.map((row) => row.playerName), [
    "Above big",
    "Below big",
    "Tie high A",
    "Tie high B",
    "Above mid",
    "Below mid",
    "Below five",
    "Above four",
    "Above three",
    "Above small",
  ]);
  assert.equal(boston.some((row) => row.teamId !== "BOS"), false);
});
