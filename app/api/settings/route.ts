import { updateSettings, type Settings, DEFAULT_SETTINGS } from "../../../lib/engine";
import { fail, readJson, respond, slatePayload, todayOr } from "../../../lib/http";
import { updateDatabase } from "../../../lib/store";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  return respond(async () => {
    const body = await readJson(request);
    const date = todayOr(body.date);
    const settings = body.settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return fail("Settings are required.");
    const patch = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = (settings as Record<string, unknown>)[key];
      if (typeof value !== "number") return fail(`${key} must be a number.`);
      patch[key] = value;
    }
    return updateDatabase(async (db) => {
      const updated = updateSettings(db, patch);
      if (updated.error) return { result: fail(updated.error) };
      return { db: updated.db, result: { ...slatePayload(updated.db, date), message: "Adjustment settings saved. Projections stores a new pregame projection when a line exists." } };
    });
  });
}
