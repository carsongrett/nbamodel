import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { applyPublicPages } from "../../../lib/sources/apply";
import { fetchPublicPages } from "../../../lib/sources/fetch-public";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const fetched = await fetchPublicPages(date);
    return updateDatabase(async (db) => {
      const applied = applyPublicPages(db, date, fetched);
      const errors = applied.messages.filter((item) => item.level === "error").length;
      return {
        db: applied.db,
        result: {
          ...slatePayload(applied.db, date),
          message: `Public sources refreshed for ${date}. ${errors} source errors are listed below. BettingPros was not called.`,
          messages: applied.messages,
        },
      };
    });
  });
}
