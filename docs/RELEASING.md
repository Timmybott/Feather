# Releasing Feather

## One-time setup (updater signing key)

The auto-updater only installs updates signed with the project's key.

1. Generate the keypair (pick a password or leave it empty):

   ```sh
   npm run tauri signer generate -- -w ~/.tauri/feather.key
   ```

2. Put the **public key** (contents of `~/.tauri/feather.key.pub`) into
   `src-tauri/tauri.conf.json` under `plugins.updater.pubkey` and commit it.

3. Add two GitHub Actions secrets (repo → Settings → Secrets → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/feather.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password (empty if none)

   Keep `~/.tauri/feather.key` safe. Losing it means shipped apps cannot
   verify future updates and users must reinstall manually.

## One-time setup (web-app deploy — optional)

On each release the workflow also builds the [web app](../README.md#feather-on-the-web)
and uploads it to the storage server's `/webroot` (the Nginx web root). It's
driven by three GitHub Actions secrets; **without them the deploy step skips
itself** and the release still succeeds, so this is optional.

Add (repo → Settings → Secrets → Actions):

- `WEBROOT_PANEL_URL` — the storage server's panel URL, e.g. `https://panel.spaceify.eu/`
- `WEBROOT_SERVER_ID` — the storage server's short id (the same server that
  holds `data/` — the web app lands in `webroot/`, `data/` is untouched)
- `WEBROOT_API_KEY` — a Pterodactyl **client** API key with file access to it

The upload is done by [`scripts/deploy-web.mjs`](../scripts/deploy-web.mjs)
(clear `/webroot` → upload `web.tar.gz` → decompress → remove the archive).

## Every release

1. Bump the version in `Cargo.toml` (workspace), `package.json` and
   `src-tauri/tauri.conf.json` — keep all three identical.
2. Update `CHANGELOG.md`: turn the top section into the new version with
   today's date. The release notes on GitHub can reuse it.
3. If the release adds or changes cloud features, ship any new SQL migration
   in `supabase/` (and any change to the `feather-storage` / `feather-panel`
   Edge Functions) and note in the release that users must run/redeploy them
   (see `docs/CLOUD-SETUP.md`). Migrations are idempotent and run by the user
   in the Supabase SQL editor; Edge Functions are deployed with the Supabase
   CLI — none of them are part of the built app.
4. Tag and push:

   ```sh
   git tag v3.1.0
   git push origin v3.1.0
   ```

5. The **Release** workflow builds:
   - Windows: NSIS installer (`Feather_…_x64-setup.exe`)
   - Linux: `.deb` and `.AppImage`
   - `latest.json` + signatures for the auto-updater
   - the **web app** (`web/dist`), uploaded to the server's `/webroot` if the
     `WEBROOT_*` secrets are set (the `deploy-web` job; it skips itself if not)
6. Review the draft release on GitHub and **publish** it. From that moment
   the built-in updater offers the new version to existing installations,
   `install.sh` picks it up, and the web app is live at the server web root.
