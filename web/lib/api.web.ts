// Web implementation of the desktop app's `src/lib/api.ts`. The web build
// redirects `../api` / `./api` here (see web/vite.config.ts) so the reused
// components (FileBrowser, FileEditor, ProjectHistory via snapshotcontent) work
// in the browser. Server files go through the `feather-panel` Edge Function;
// commit snapshots are fetched via `feather-storage` and unzipped in-browser.
// Everything the browser genuinely can't do is a clear rejection.

import { unzipSync, strFromU8 } from "fflate";
import type { FileEntry } from "../../src/lib/types";
import { panelFetch, panelJson } from "./panel";

interface PteroFileAttributes {
  name: string;
  size: number;
  is_file: boolean;
  is_symlink: boolean;
  mimetype: string;
  modified_at: string;
}

export async function listServerFiles(
  panelId: string,
  identifier: string,
  directory: string,
): Promise<FileEntry[]> {
  const data = await panelJson<{ data: { attributes: PteroFileAttributes }[] }>({
    action: "list",
    panel: panelId,
    server: identifier,
    directory,
  });
  return (data.data ?? []).map((f) => ({
    name: f.attributes.name,
    size: f.attributes.size,
    is_file: f.attributes.is_file,
    is_symlink: f.attributes.is_symlink,
    mimetype: f.attributes.mimetype,
    modified_at: f.attributes.modified_at,
  }));
}

export async function deleteServerFiles(
  panelId: string,
  identifier: string,
  root: string,
  files: string[],
): Promise<void> {
  await panelJson(
    { action: "delete", panel: panelId, server: identifier },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, files }),
    },
  );
}

export async function createServerFolder(
  panelId: string,
  identifier: string,
  root: string,
  name: string,
): Promise<void> {
  await panelJson(
    { action: "create-folder", panel: panelId, server: identifier },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root, name }),
    },
  );
}

export async function readServerFile(
  panelId: string,
  identifier: string,
  path: string,
): Promise<string> {
  const res = await panelFetch({ action: "read", panel: panelId, server: identifier, file: path });
  if (!res.ok) {
    let msg = `read failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(msg);
  }
  return await res.text();
}

export async function writeServerFile(
  panelId: string,
  identifier: string,
  path: string,
  content: string,
): Promise<void> {
  const res = await panelFetch(
    { action: "write", panel: panelId, server: identifier, file: path },
    { method: "POST", headers: { "content-type": "text/plain" }, body: content },
  );
  if (!res.ok) throw new Error(`write failed: ${res.status}`);
}

interface SnapshotFile {
  found: boolean;
  text: string;
}

/** One file's text from a commit's stored delta zip, unzipped in the browser. */
export async function snapshotFile(
  endpoint: string,
  token: string,
  anonKey: string,
  projectId: string,
  commitId: string,
  path: string,
): Promise<SnapshotFile> {
  const res = await fetch(
    `${endpoint}?action=get&project_id=${projectId}&commit_id=${commitId}&kind=commit`,
    { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } },
  );
  if (!res.ok) return { found: false, text: "" };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return { found: false, text: "" };
  }
  const entry = files[path] ?? files[path.replace(/^\/+/, "")];
  if (!entry) return { found: false, text: "" };
  return { found: true, text: strFromU8(entry) };
}

/** Local-folder features don't exist on the web. */
export function readLocalFile(): Promise<string> {
  return Promise.reject(new Error("Local files aren't available on the web."));
}
