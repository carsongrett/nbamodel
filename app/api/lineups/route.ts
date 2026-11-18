import { fail, respond } from "../../../lib/http";
import { fetchRotowireLineups } from "../../../lib/sources/rotowire-lineups";

export const dynamic = "force-dynamic";

/** Reads the public Rotowire lineup page and returns notes. Nothing is stored. */
export async function POST() {
  return respond(async () => {
    const loaded = await fetchRotowireLineups();
    if (!loaded.ok) return fail(loaded.error, 502);
    return { ok: true, message: loaded.message, teams: loaded.teams };
  });
}
