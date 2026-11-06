import { commitProjections, collectProjectionSources } from "../../../lib/sources/daily-run";
import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const collected = await collectProjectionSources(date, new Date().toISOString());
    return updateDatabase(async (db) => {
      const committed = commitProjections(db, date, collected);
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
