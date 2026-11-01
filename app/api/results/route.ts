import { importRecords } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { parseTable } from "../../../lib/parse";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const text = typeof body.text === "string" ? body.text : "";
    const adapter = body.adapter === "json" ? "json" : body.adapter === "csv" ? "csv" : null;
    return updateDatabase(async (db) => {
      let next = db;
      let message = "Graded saved pregame projections against actuals already stored. Projections, lines, odds, and timestamps were not recalculated.";
      let imported = null;
      if (text.trim()) {
        if (!adapter) return { result: fail("Choose the csv or json adapter for the actuals file.") };
        const parsed = parseTable(adapter, text);
        if (parsed.error) return { result: fail(parsed.error) };
        const result = importRecords(db, "actuals", parsed.rows);
        next = result.db;
        imported = { errors: result.errors, warnings: result.warnings, inserted: result.inserted, updated: result.updated, rejected: result.rejected };
        message = `Actuals: ${result.inserted} added, ${result.updated} updated, ${result.rejected} rejected. Saved pregame projections were not overwritten.`;
      }
      const payload = slatePayload(next, date);
      const onDate = payload.slate.rows.length;
      if (!text.trim() && !next.actuals.some((row) => payload.slate.rows.some((slateRow) => slateRow.playerId === row.playerId && slateRow.gameId === row.gameId))) {
        message = "No actuals are stored for this date. Import a CSV or JSON file, or import the sample actuals. No live stats feed is configured.";
      }
      return { db: next, result: { ...payload, message, import: imported, players: onDate } };
    });
  });
}
