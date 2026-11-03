import { applyMinutesSuggestion } from "../../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../../lib/http";
import { updateDatabase } from "../../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return fail("Finding id is required.");
    return updateDatabase(async (db) => {
      const applied = applyMinutesSuggestion(db, id, new Date().toISOString());
      if (applied.error) return { result: fail(applied.error) };
      return {
        db: applied.db,
        result: {
          ...slatePayload(applied.db, date),
          message: "Minutes suggestion saved as an override. The pregame projection was not changed.",
        },
      };
    });
  });
}
