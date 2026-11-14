import { importRecords, IMPORT_KINDS, type ImportKind } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { parseTable } from "../../../lib/parse";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const adapter = body.adapter === "json" ? "json" : body.adapter === "csv" ? "csv" : null;
    const kind = typeof body.kind === "string" && (IMPORT_KINDS as readonly string[]).includes(body.kind) ? body.kind as ImportKind : null;
    const text = typeof body.text === "string" ? body.text : "";
    const date = todayOr(body.date);
    if (!adapter) return fail("Adapter must be csv or json.");
    if (!kind) return fail("Unknown import kind.");
    if (!text.trim()) return fail("The file is empty.");
    const parsed = parseTable(adapter, text);
    if (parsed.error) return fail(parsed.error);
    return updateDatabase(async (db) => {
      const imported = importRecords(db, kind, parsed.rows);
      const summary = `${kind}: ${imported.inserted} added, ${imported.updated} updated, ${imported.rejected} rejected.`;
      return {
        db: imported.db,
        result: {
          ...slatePayload(imported.db, date),
          import: { errors: imported.errors, warnings: imported.warnings, inserted: imported.inserted, updated: imported.updated, rejected: imported.rejected },
          message: summary,
        },
      };
    });
  });
}
