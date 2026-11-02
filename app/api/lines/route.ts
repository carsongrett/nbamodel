import { setPropLine, type Stat } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

const STATS = new Set<Stat>(["points", "rebounds", "points_rebounds"]);

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const stat = body.stat;
    if (!playerId || !gameId) return fail("playerId and gameId are required.");
    if (typeof stat !== "string" || !STATS.has(stat as Stat)) return fail("Stat must be points, rebounds, or points_rebounds.");
    const line = body.line == null || body.line === "" ? null : Number(body.line);
    if (line != null && !Number.isFinite(line)) return fail("The line must be a number or blank to clear.");
    return updateDatabase(async (db) => {
      const updated = setPropLine(db, playerId, gameId, stat as Stat, line, new Date().toISOString());
      if (updated.error) return { result: fail(updated.error) };
      return {
        db: updated.db,
        result: {
          ...slatePayload(updated.db, date),
          message: line == null ? "Line cleared." : "Line saved. The projection uses it now.",
        },
      };
    });
  });
}

export const POST = PUT;
