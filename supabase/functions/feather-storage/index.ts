// Feather storage proxy (Supabase Edge Function).
//
// Feather stores commit snapshots and rollback states as files on a dedicated
// Pterodactyl server. This function is the ONLY thing that ever holds that
// server's API key: the desktop app calls this function, never the panel
// directly, so the key stays server-side and is never shipped in the app.
//
// What it does on every request:
//   1. Authenticates the caller with their Supabase JWT.
//   2. Confirms they are a member of the team that owns the referenced project
//      (Row-Level Security on `projects` does the check — a non-member simply
//      can't see the row).
//   3. Derives the storage path *itself* from the ids (the client never passes
//      raw paths), so a caller can only ever touch their own team's area:
//        <STORAGE_ROOT>/<team_id>/<project_id>/<kind>s/<commit_id>.zip
//   4. Performs the file op against the Pterodactyl client API, creating the
//      folder tree on first write. Nginx and the rest of the server are never
//      touched.
//
// Deploy + configuration: see supabase/functions/feather-storage/README.md.
//
// Required secrets (supabase secrets set …):
//   FEATHER_STORAGE_KEY   Pterodactyl client API key for the storage server.
// Optional (have sensible defaults):
//   STORAGE_PANEL_URL     default https://panel.spaceify.eu/
//   STORAGE_SERVER_ID     default 893a2ffd
//   STORAGE_ROOT          default data   (base dir on the server)
// Provided automatically by the Supabase runtime:
//   SUPABASE_URL, SUPABASE_ANON_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const PANEL_URL = (Deno.env.get("STORAGE_PANEL_URL") ?? "https://panel.spaceify.eu/").replace(
  /\/?$/,
  "/",
);
const SERVER_ID = Deno.env.get("STORAGE_SERVER_ID") ?? "893a2ffd";
const ROOT = (Deno.env.get("STORAGE_ROOT") ?? "data").replace(/^\/+|\/+$/g, "");
const STORAGE_KEY = Deno.env.get("FEATHER_STORAGE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // `apikey` and `x-client-info` are sent by the browser Supabase client (the
  // web app calls this function directly for commit diffs). They MUST be allowed
  // or the CORS preflight fails and the browser reports "Failed to fetch".
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

/** URL-safe slug for a web deployment path (lowercase, [a-z0-9-]). */
function slugify(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

/** True when the caller (from the request's token) is a member of `teamId`. */
async function isMember(
  sb: ReturnType<typeof createClient>,
  teamId: string,
): Promise<boolean> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return false;
  const { data } = await sb
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return !!data;
}

/** A Pterodactyl client-API call against the storage server. */
async function ptero(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${STORAGE_KEY}`);
  headers.set("Accept", "application/json");
  return await fetch(new URL(path, PANEL_URL), { ...init, headers });
}

/** Create `dir` and every parent under the server root; ignore "exists". */
async function ensureDir(dir: string): Promise<void> {
  const parts = dir.split("/").filter(Boolean);
  let root = "/";
  for (const name of parts) {
    const res = await ptero(`api/client/servers/${SERVER_ID}/files/create-folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, name }),
    });
    // 204 = created; a 4xx here is almost always "already exists" — fine.
    if (!res.ok && res.status >= 500) {
      throw new Error(`create-folder ${root}${name} failed: ${res.status}`);
    }
    root = root === "/" ? `/${name}` : `${root}/${name}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (STORAGE_KEY === "") return json({ error: "storage backend not configured" }, 503);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";
  const projectId = url.searchParams.get("project_id") ?? "";
  const commitId = url.searchParams.get("commit_id") ?? "";
  const kind = url.searchParams.get("kind") ?? "commit"; // commit | rollback

  const needsCommit = action !== "list" && action !== "publish-web" && action !== "unpublish-web";
  if (!UUID.test(projectId)) return json({ error: "bad project_id" }, 400);
  if (kind !== "commit" && kind !== "rollback") return json({ error: "bad kind" }, 400);
  if (needsCommit && !UUID.test(commitId)) return json({ error: "bad commit_id" }, 400);

  // 1 + 2. Authenticate and authorize via the caller's token + RLS.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing token" }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: project, error } = await supabase
    .from("projects")
    .select("team_id")
    .eq("id", projectId)
    .single();
  if (error || !project) return json({ error: "not authorized for this project" }, 403);

  // 3. Derive the path — the client never supplies one.
  const dir = `${ROOT}/${project.team_id}/${projectId}/${kind}s`;
  const file = `/${dir}/${commitId}.zip`;

  try {
    // 4. Perform the file op.
    switch (action) {
      case "put": {
        await ensureDir(dir);
        const body = new Uint8Array(await req.arrayBuffer());
        const res = await ptero(
          `api/client/servers/${SERVER_ID}/files/write?file=${encodeURIComponent(file)}`,
          { method: "POST", headers: { "content-type": "application/octet-stream" }, body },
        );
        if (!res.ok) return json({ error: `write failed: ${res.status}` }, 502);
        return json({ ok: true, bytes: body.byteLength });
      }
      case "get": {
        // Use a signed download URL, not files/contents: contents is meant for
        // text and rejects binary/large files (our zips) with HTTP 400.
        const res = await ptero(
          `api/client/servers/${SERVER_ID}/files/download?file=${encodeURIComponent(file)}`,
        );
        if (!res.ok) return json({ error: `read failed: ${res.status}` }, res.status);
        const signed = (await res.json())?.attributes?.url;
        if (!signed) return json({ error: "no download url" }, 502);
        const dl = await fetch(signed);
        if (!dl.ok) return json({ error: `download failed: ${dl.status}` }, 502);
        return new Response(dl.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/octet-stream" },
        });
      }
      case "delete": {
        const res = await ptero(`api/client/servers/${SERVER_ID}/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: `/${dir}`, files: [`${commitId}.zip`] }),
        });
        if (!res.ok) return json({ error: `delete failed: ${res.status}` }, 502);
        return json({ ok: true });
      }
      case "list": {
        const res = await ptero(
          `api/client/servers/${SERVER_ID}/files/list?directory=${encodeURIComponent(`/${dir}`)}`,
        );
        if (!res.ok) return json({ files: [] });
        return new Response(res.body, {
          status: 200,
          headers: { ...CORS, "content-type": "application/json" },
        });
      }
      case "publish-web": {
        // Publish the project's latest deployed snapshot to the nginx web root
        // under /webroot/webdeployment/<slug>/ (members only).
        if (!(await isMember(supabase, project.team_id))) {
          return json({ error: "only team members can publish" }, 403);
        }
        const slug = slugify(url.searchParams.get("slug") ?? "");
        if (!slug) return json({ error: "bad slug" }, 400);

        // The most recent released deploy bundle → its full-tree snapshot.
        const { data: bundle } = await supabase
          .from("deploy_bundles")
          .select("id")
          .eq("project_id", projectId)
          .eq("status", "released")
          .order("released_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!bundle) return json({ error: "deploy the project first" }, 409);

        const snap = `/${ROOT}/${project.team_id}/${projectId}/rollbacks/${bundle.id}.zip`;
        const dl = await ptero(
          `api/client/servers/${SERVER_ID}/files/download?file=${encodeURIComponent(snap)}`,
        );
        if (!dl.ok) return json({ error: `snapshot read failed: ${dl.status}` }, 502);
        const signed = (await dl.json())?.attributes?.url;
        if (!signed) return json({ error: "no download url" }, 502);
        const zipRes = await fetch(signed);
        if (!zipRes.ok) return json({ error: `snapshot download failed: ${zipRes.status}` }, 502);
        const zipBytes = new Uint8Array(await zipRes.arrayBuffer());

        const target = `/webroot/webdeployment/${slug}`;
        await ensureDir(`webroot/webdeployment/${slug}`);
        // Clear any previous publish so removed files don't linger.
        const listing = await ptero(
          `api/client/servers/${SERVER_ID}/files/list?directory=${encodeURIComponent(target)}`,
        );
        if (listing.ok) {
          const names = ((await listing.json()).data ?? []).map(
            (f: { attributes: { name: string } }) => f.attributes.name,
          );
          if (names.length > 0) {
            await ptero(`api/client/servers/${SERVER_ID}/files/delete`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ root: target, files: names }),
            });
          }
        }
        // Upload the snapshot into the target dir, extract it, remove the archive.
        const up = await ptero(`api/client/servers/${SERVER_ID}/files/upload`);
        if (!up.ok) return json({ error: `upload url failed: ${up.status}` }, 502);
        const uploadUrl = (await up.json()).attributes.url;
        const form = new FormData();
        form.append("files", new Blob([zipBytes]), "site.zip");
        const put = await fetch(`${uploadUrl}&directory=${encodeURIComponent(target)}`, {
          method: "POST",
          body: form,
        });
        if (!put.ok) return json({ error: `upload failed: ${put.status}` }, 502);
        const dec = await ptero(`api/client/servers/${SERVER_ID}/files/decompress`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: target, file: "site.zip" }),
        });
        if (!dec.ok) return json({ error: `decompress failed: ${dec.status}` }, 502);
        await ptero(`api/client/servers/${SERVER_ID}/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: target, files: ["site.zip"] }),
        });
        return json({ ok: true, slug });
      }
      case "unpublish-web": {
        if (!(await isMember(supabase, project.team_id))) {
          return json({ error: "only team members can unpublish" }, 403);
        }
        const slug = slugify(url.searchParams.get("slug") ?? "");
        if (!slug) return json({ error: "bad slug" }, 400);
        await ptero(`api/client/servers/${SERVER_ID}/files/delete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root: "/webroot/webdeployment", files: [slug] }),
        });
        return json({ ok: true });
      }
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
