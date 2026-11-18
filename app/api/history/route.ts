import { historyErrorRows, historyErrorWindowsByStat } from "../../../lib/history";
import { fail, respond } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const date = new URL(request.url).searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Date must be YYYY-MM-DD.");
    return updateDatabase(async (db) => ({
      result: { ok: true as const, ...historyErrorWindowsByStat(historyErrorRows(db), date) },
    }));
  });
}
