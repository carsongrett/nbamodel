import { setMinutesOverride } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const minutes = body.minutes == null || body.minutes === "" ? null : Number(body.minutes);
    if (!playerId || !gameId) return fail("playerId and gameId are required.");
    if (minutes != null && !Number.isFinite(minutes)) return fail("Minutes must be a number or blank to clear.");
    return updateDatabase(async (db) => {
      const updated = setMinutesOverride(db, playerId, gameId, minutes);
      if (updated.error) return { result: fail(updated.error) };
      return {
        db: updated.db,
        result: { ...slatePayload(updated.db, date), message: minutes == null ? "Minutes override cleared." : "Minutes override saved. Projections stores it in the pregame projection when a line exists." },
      };
    });
  });
}
