import { commitLines, collectLines } from "../../../lib/sources/daily-run";
import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const savedAt = new Date().toISOString();
    const odds = await collectLines(date);
    return updateDatabase(async (db) => {
      const committed = commitLines(db, date, odds, savedAt);
      return {
        db: committed.db,
        result: {
          ...slatePayload(committed.db ?? db, date),
          message: committed.message,
          messages: committed.messages,
        },
      };
    });
  });
}
