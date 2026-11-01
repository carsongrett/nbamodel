import { applyModelRun } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    if (!date) return fail("Date must be YYYY-MM-DD.");
    return updateDatabase(async (db) => {
      const ran = applyModelRun(db, date, new Date().toISOString());
      return { db: ran.db, result: { ...slatePayload(ran.db, date), messages: ran.messages } };
    });
  });
}
