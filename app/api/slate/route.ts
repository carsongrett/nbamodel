import { fail, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const date = todayOr(new URL(request.url).searchParams.get("date"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Date must be YYYY-MM-DD.");
    return updateDatabase(async (db) => ({ result: slatePayload(db, date) }));
  });
}
