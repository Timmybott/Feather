# `feather-panel` Edge Function

The panel proxy for Feather's **web app**. A browser cannot call a team's
Pterodactyl panel directly — panels don't allow cross-origin requests, and the
panel API key must never reach the browser. This function is the bridge: the web
app calls it, and it forwards one file/server/console operation to the panel
using the team's stored key. See the header of [`index.ts`](./index.ts) for the
full request flow.

The **desktop app never uses this** — it talks to panels through the local Tauri
core, exactly as before. This function exists only so the web app can browse
files and stream the live console.

## What it proxies

Each request carries `?action=…&panel=<uuid>&server=<identifier>`:

| action          | panel endpoint                       | used for                     |
| --------------- | ------------------------------------ | ---------------------------- |
| `servers`       | `api/client`                         | resolve a project's server   |
| `resources`     | `…/resources`                        | live CPU/RAM/disk on Overview |
| `websocket`     | `…/websocket`                        | Console tab (Wings socket)   |
| `list`          | `…/files/list?directory=`            | Files tab                    |
| `read`          | `…/files/contents?file=`             | open a file                  |
| `write`         | `…/files/write?file=`                | save a file (members only)   |
| `create-folder` | `…/files/create-folder`              | new folder (members only)    |
| `delete`        | `…/files/delete`                     | delete (members only)        |
| `command`       | `…/command`                          | send a console command       |

The reserved storage server (`STORAGE_SERVER_ID`, default `893a2ffd`) is refused
as a target, exactly like the desktop core does.

## One-time setup

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your
project (`supabase link`).

```sh
supabase functions deploy feather-panel
```

**No secrets to set.** Unlike `feather-storage`, this function holds no key of
its own — it reads the panel's URL and decrypts its API key per request from the
database, so it only works for panels the caller is actually a member of.
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the runtime; optionally
set `STORAGE_SERVER_ID` if your reserved server id differs from the default.

## Security notes

- **The caller's own JWT authorizes everything.** The panel row is read through
  Row-Level Security, which only returns it to a member of the panel's team, and
  the key is decrypted by the `panel_api_key` RPC, which re-checks membership.
  A non-member is rejected before any panel call is made.
- **The panel key never reaches the browser.** It is decrypted inside the
  function, used for the one forwarded request, and discarded.
- **Public read, member write.** Anonymous visitors can browse public projects
  (see migration `0019`), but file listing, reading, writing and the console all
  go through this function, which requires a logged-in team member — so viewing a
  server's files or console always needs membership, while overview/issues/
  history stay open to everyone.
- Requests without a `Bearer` token, with a malformed panel/server id, or
  targeting the reserved storage server are rejected up front.
