// Feather panel proxy (Supabase Edge Function).
//
// The web app (running in a browser) can't call a team's Pterodactyl panel
// directly: browsers block cross-origin requests to panels, and the panel API
// key must never reach the browser. This function is the bridge. On every
// request it:
//   1. Authenticates the caller with their Supabase JWT.
//   2. Reads the panel row with the caller's token — Row-Level Security on
//      `panels` only returns it for a member of the panel's team, so a
//      non-member is rejected here.
//   3. Decrypts the panel key server-side via the `panel_api_key` RPC (which
//      re-checks membership). The plaintext key never leaves this function.
//   4. Proxies one file/server/console operation to the panel and returns it.
//
// The reserved storage server is refused, exactly like the desktop core does.
//
// Deploy: `supabase functions deploy feather-panel`. No extra secrets — the
// panel URL and key come from the database per request. Provided automatically
// by the runtime: SUPABASE_URL, SUPABASE_ANON_KEY.
// Optional: STORAGE_SERVER_ID (default 893a2ffd) — refused as a target.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESERVED_SERVER_ID = Deno.env.get("STORAGE_SERVER_ID") ?? "893a2ffd";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // `apikey` and `x-client-info` are sent by the browser Supabase client, so
  // they MUST be allowed here or the CORS preflight fails and the browser
  // reports "TypeError: Failed to fetch" before the request is even made.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Pterodactyl server identifiers are short hex strings.
const IDENT = /^[0-9a-z]+$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const panelId = url.searchParams.get("panel") ?? "";
  const server = url.searchParams.get("server") ?? "";

  if (!UUID.test(panelId)) return json({ error: "bad panel id" }, 400);
  // The `servers` action lists a panel's servers and needs no server id.
  if (action !== "servers" && !IDENT.test(server)) return json({ error: "bad server id" }, 400);
  if (server && server === RESERVED_SERVER_ID) return json({ error: "server not available" }, 403);

  // 1. Authenticate.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing token" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // 2. Read the panel (RLS restricts this to members of the panel's team).
  const { data: panel, error: panelErr } = await supabase
    .from("panels")
    .select("base_url")
    .eq("id", panelId)
    .single();
  if (panelErr || !panel) return json({ error: "not authorized for this panel" }, 403);

  // 3. Decrypt the key server-side (membership re-checked in the RPC).
  const { data: key, error: keyErr } = await supabase.rpc("panel_api_key", { p_panel: panelId });
  if (keyErr || typeof key !== "string" || key === "") {
    return json({ error: "could not access this panel" }, 403);
  }

  const base = String(panel.base_url).replace(/\/?$/, "/");
  const ptero = (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Accept", "application/json");
    return fetch(new URL(path, base), { ...init, headers });
  };
  const api = `api/client/servers/${server}`;

  try {
    switch (action) {
      case "servers": {
        const res = await ptero("api/client");
        if (!res.ok) return json({ error: `panel ${res.status}` }, 502);
        return new Response(res.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
      case "resources": {
        const res = await ptero(`${api}/resources`);
        if (!res.ok) return json({ error: `panel ${res.status}` }, 502);
        return new Response(res.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
      case "websocket": {
        const res = await ptero(`${api}/websocket`);
        if (!res.ok) return json({ error: `panel ${res.status}` }, 502);
        return new Response(res.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
      case "list": {
        const directory = url.searchParams.get("directory") ?? "/";
        const res = await ptero(`${api}/files/list?directory=${encodeURIComponent(directory)}`);
        if (!res.ok) return json({ error: `panel ${res.status}` }, 502);
        return new Response(res.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
      case "read": {
        const file = url.searchParams.get("file") ?? "";
        const res = await ptero(`${api}/files/contents?file=${encodeURIComponent(file)}`);
        if (!res.ok) return json({ error: `panel ${res.status}` }, res.status);
        const text = await res.text();
        return new Response(text, { status: 200, headers: { ...CORS, "content-type": "text/plain" } });
      }
      case "write": {
        const file = url.searchParams.get("file") ?? "";
        const body = await req.text();
        const res = await ptero(`${api}/files/write?file=${encodeURIComponent(file)}`, {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body,
        });
        if (!res.ok) return json({ error: `write failed: ${res.status}` }, 502);
        return json({ ok: true });
      }
      case "create-folder": {
        const body = await req.json();
        const res = await ptero(`${api}/files/create-folder`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: body.root ?? "/", name: body.name ?? "" }),
        });
        if (!res.ok) return json({ error: `create failed: ${res.status}` }, 502);
        return json({ ok: true });
      }
      case "delete": {
        const body = await req.json();
        const res = await ptero(`${api}/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: body.root ?? "/", files: body.files ?? [] }),
        });
        if (!res.ok) return json({ error: `delete failed: ${res.status}` }, 502);
        return json({ ok: true });
      }
      case "command": {
        const body = await req.json();
        const res = await ptero(`${api}/command`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: body.command ?? "" }),
        });
        if (!res.ok) return json({ error: `command failed: ${res.status}` }, 502);
        return json({ ok: true });
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
