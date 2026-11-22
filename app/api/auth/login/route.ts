import { authConfigured, ownerEmail, supabaseServer } from "../../../../lib/auth";
import { fail, readJson, respond } from "../../../../lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    if (!authConfigured()) return fail("Supabase auth is not configured.", 400);
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return fail("Email and password are required.");
    if (email.toLowerCase() !== ownerEmail()) return fail("That email is not the owner account.", 403);
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail(error.message, 401);
    return { ok: true };
  });
}
