// Feather account deletion (Supabase Edge Function).
//
// A client can't delete its own auth user — that needs the service role. This
// function does it safely: it verifies the caller's JWT, then, using the
// service role (injected by the runtime as SUPABASE_SERVICE_ROLE_KEY):
//   1. Deletes every team the caller OWNS. teams.owner_id is ON DELETE RESTRICT,
//      so the user can't be removed while owning teams; deleting the teams first
//      cascades away their projects, panels, deploys, commits and issues.
//   2. Deletes the auth user, which cascades to their profile and memberships.
//
// Deploy: `supabase functions deploy delete-account` (verify_jwt is off in
// supabase/config.toml — this function does its own auth).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing token" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is calling?
  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: "not authenticated" }, 401);
  const userId = userData.user.id;

  const admin = createClient(url, serviceRole, { auth: { persistSession: false } });

  // 1. Delete teams this user owns (cascades their data).
  const { error: teamErr } = await admin.from("teams").delete().eq("owner_id", userId);
  if (teamErr) return json({ error: `could not remove owned teams: ${teamErr.message}` }, 500);

  // 2. Delete the auth user (cascades profile + memberships).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: delErr.message }, 500);

  return json({ ok: true });
});
