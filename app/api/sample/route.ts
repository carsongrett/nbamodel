import { readFile } from "node:fs/promises";
import path from "node:path";
import { IMPORT_KINDS, importBundle, recordsFromObjects, type ImportKind } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const part = body.part === "actuals" ? "actuals" : "slate";
    const date = todayOr(body.date);
    const file = await readFile(path.join(process.cwd(), "data", "sample", "bundle.json"), "utf8");
    const bundle = JSON.parse(file) as Record<string, unknown>;
    const sections: Partial<Record<ImportKind, ReturnType<typeof recordsFromObjects>>> = {};
    for (const kind of IMPORT_KINDS) {
      if (part === "actuals" && kind !== "actuals") continue;
      if (part === "slate" && kind === "actuals") continue;
      const rows = bundle[kind];
      if (!Array.isArray(rows)) continue;
      sections[kind] = recordsFromObjects(rows);
    }
    if (part === "actuals" && !sections.actuals) return fail("Sample actuals are missing from the bundle.");
    return updateDatabase(async (db) => {
      const imported = importBundle(db, sections);
      const inserted = imported.results.reduce((sum, result) => sum + result.inserted, 0);
      const updated = imported.results.reduce((sum, result) => sum + result.updated, 0);
      const rejected = imported.results.reduce((sum, result) => sum + result.rejected, 0);
      const label = part === "actuals" ? "Sample actuals" : "Sample slate";
      return {
        db: imported.db,
        result: {
          ...slatePayload(imported.db, date),
          message: `${label}: ${inserted} added, ${updated} updated, ${rejected} rejected. Reloading does not duplicate rows.`,
          results: imported.results.map((result) => ({
            kind: result.kind,
            inserted: result.inserted,
            updated: result.updated,
            rejected: result.rejected,
            errors: result.errors,
            warnings: result.warnings,
          })),
        },
      };
    });
  });
}
