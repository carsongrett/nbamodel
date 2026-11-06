import { readJson, respond, slatePayload, todayOr } from "../../../../lib/http";
import { applyBettingProsProbe } from "../../../../lib/sources/apply-bettingpros";
import { fetchBettingProsDay } from "../../../../lib/sources/bettingpros";
import { updateDatabase } from "../../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const retrievedAt = new Date().toISOString();
    const probe = await fetchBettingProsDay(date);
    return updateDatabase(async (db) => {
      const applied = applyBettingProsProbe(db, date, probe, retrievedAt);
      return {
        db: probe.state === "parsed" ? applied.db : undefined,
        result: {
          ...slatePayload(applied.db, date),
          message: probe.message,
          messages: applied.messages,
        },
      };
    });
  });
}
