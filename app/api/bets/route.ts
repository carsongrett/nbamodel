import { betTracking } from "../../../lib/bets";
import { setBetUnits, chicagoToday, type Stat } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

const STATS = new Set<Stat>(["points", "rebounds", "points_rebounds"]);

export async function GET() {
  return respond(async () => {
    const today = chicagoToday();
    return updateDatabase(async (db) => ({
      result: { ok: true as const, ...betTracking(db, today) },
    }));
  });
}

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const stat = body.stat;
    if (!playerId || !gameId) return fail("playerId and gameId are required.");
    if (typeof stat !== "string" || !STATS.has(stat as Stat)) return fail("Stat must be points, rebounds, or points_rebounds.");
    const units = body.units == null || body.units === "" ? null : Number(body.units);
    if (units != null && !Number.isFinite(units)) return fail("Units must be a positive number or blank to clear.");
    return updateDatabase(async (db) => {
      const updated = setBetUnits(db, playerId, gameId, stat as Stat, units, new Date().toISOString());
      if (updated.error) return { result: fail(updated.error) };
      return {
        db: updated.db,
        result: {
          ...slatePayload(updated.db, date),
          message: units == null ? "Bet cleared." : "Bet saved.",
        },
      };
    });
  });
}

export const POST = PUT;
