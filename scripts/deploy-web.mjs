// Upload the built web app (web/dist, pre-packed into web.tar.gz) to the
// Feather storage server's /webroot via the Pterodactyl client API, so the
// website updates together with every desktop-app release.
//
// The server layout (see docs/CLOUD-SETUP.md):
//   /home/container/webroot   ← the web app lives here (Nginx web root)
//   /home/container/data      ← commit/rollback snapshots (untouched)
//
// Required env (GitHub Actions secrets):
//   WEBROOT_PANEL_URL   e.g. https://panel.spaceify.eu/
//   WEBROOT_SERVER_ID   the storage server's short id
//   WEBROOT_API_KEY     a client API key with file access to that server
// If WEBROOT_API_KEY is empty the deploy is skipped (exit 0), so the release
// still succeeds when the web deploy isn't configured yet.

import { readFile } from "node:fs/promises";

const PANEL = (process.env.WEBROOT_PANEL_URL ?? "").replace(/\/?$/, "/");
const SERVER = process.env.WEBROOT_SERVER_ID ?? "";
const KEY = process.env.WEBROOT_API_KEY ?? "";
const ROOT = "/webroot";
const ARCHIVE = "feather-web.tar.gz";

if (!KEY || !SERVER || !PANEL) {
  console.log("Web deploy not configured (WEBROOT_* secrets missing) — skipping.");
  process.exit(0);
}

function ptero(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${KEY}`);
  headers.set("Accept", "application/json");
  return fetch(new URL(path, PANEL), { ...init, headers });
}

// Accepts a Response or a Promise<Response> (fetch/ptero return the latter), so
// callers can pass the fetch call directly. Awaiting a non-promise is a no-op,
// so an already-resolved Response works too.
async function must(response, what) {
  const res = await response;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed: HTTP ${res.status} ${body}`);
  }
  return res;
}

// 1. Clear the current web root so removed files don't linger.
const list = await ptero(`api/client/servers/${SERVER}/files/list?directory=${encodeURIComponent(ROOT)}`);
if (list.ok) {
  const names = ((await list.json()).data ?? []).map((f) => f.attributes.name);
  if (names.length > 0) {
    await must(
      ptero(`api/client/servers/${SERVER}/files/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ root: ROOT, files: names }),
      }),
      "clear webroot",
    );
  }
} else {
  // The folder may not exist yet — create it.
  await ptero(`api/client/servers/${SERVER}/files/create-folder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ root: "/", name: "webroot" }),
  });
}

// 2. Upload the archive to /webroot via a signed upload URL.
const signed = await must(
  ptero(`api/client/servers/${SERVER}/files/upload`),
  "request upload url",
);
const uploadUrl = (await signed.json()).attributes.url;
const form = new FormData();
form.append("files", new Blob([await readFile("web.tar.gz")]), ARCHIVE);
await must(
  fetch(`${uploadUrl}&directory=${encodeURIComponent(ROOT)}`, { method: "POST", body: form }),
  "upload archive",
);

// 3. Decompress it in place, then remove the archive.
await must(
  ptero(`api/client/servers/${SERVER}/files/decompress`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ root: ROOT, file: ARCHIVE }),
  }),
  "decompress",
);
await ptero(`api/client/servers/${SERVER}/files/delete`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ root: ROOT, files: [ARCHIVE] }),
});

console.log("Web app deployed to the server web root.");
