import { readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { applyPublicPages } from "../../../lib/sources/apply";
import { applyBettingProsProbe } from "../../../lib/sources/apply-bettingpros";
import { fetchBettingProsDay } from "../../../lib/sources/bettingpros";
import { fetchPublicPages } from "../../../lib/sources/fetch-public";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const fetched = await fetchPublicPages(date);
    const odds = await fetchBettingProsDay(date);
    const retrievedAt = new Date().toISOString();
    return updateDatabase(async (db) => {
      const applied = applyPublicPages(db, date, fetched);
      const oddsApplied = applyBettingProsProbe(applied.db, date, odds, retrievedAt);
      const next = odds.state === "parsed" ? oddsApplied.db : applied.db;
      const messages = [...applied.messages, ...oddsApplied.messages];
      const errors = messages.filter((item) => item.level === "error").length;
      const graded = messages.find((item) => item.message.startsWith("Basketball Reference leaders graded"));
      const lead = graded
        ? `Today's slate loaded for ${date}. ${graded.message}`
        : `Today's slate loaded for ${date}.`;
      return {
        db: next,
        result: {
          ...slatePayload(next, date),
          message: errors ? `${lead} ${errors} source errors are listed below.` : lead,
          messages,
        },
      };
    });
  });
}
