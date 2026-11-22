import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { researchSlate } from "../../../lib/research";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    return updateDatabase(async (db) => {
      const result = await researchSlate(db, date, new Date().toISOString());
      return {
        db: result.status === "ok" ? result.db : undefined,
        result: { ...slatePayload(result.db, date), message: result.message, researchStatus: result.status },
      };
    });
  });
}
