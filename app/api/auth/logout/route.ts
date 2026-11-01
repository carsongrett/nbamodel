import { authConfigured, supabaseServer } from "../../../../lib/auth";
import { respond } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return respond(async () => {
    if (!authConfigured()) return { ok: true };
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    return { ok: true };
  });
}
