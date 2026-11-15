import { finishRun } from "../../../lib/engine";
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
      if (!committed.db) {
        return {
          result: {
            ...slatePayload(db, date),
            message: committed.message,
            messages: committed.messages,
          },
        };
      }
      const finished = finishRun(committed.db, "projections", new Date().toISOString());
      return {
        db: finished,
        result: {
          ...slatePayload(finished, date),
          message: committed.message,
          messages: committed.messages,
        },
      };
    });
  });
}
