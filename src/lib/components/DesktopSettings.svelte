<script lang="ts">
  import { relaunch } from "@tauri-apps/plugin-process";
  import { check, type Update } from "@tauri-apps/plugin-updater";
  import { onMount } from "svelte";
  import { auth } from "../auth.svelte";
  import { deleteAccount } from "../cloud";
  import { APP_VERSION } from "../version";

  let { onClose }: { onClose: () => void } = $props();

  const NOTIF_KEY = "feather.notifications";

  let notifications = $state(false);
  let update = $state<Update | null>(null);
  let checking = $state(false);
  let installing = $state(false);
  let checkedOnce = $state(false);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    notifications = localStorage.getItem(NOTIF_KEY) === "on";
    void doCheck();
  });

  async function doCheck() {
    checking = true;
    try {
      update = await check();
    } catch {
      update = null;
    } finally {
      checking = false;
      checkedOnce = true;
    }
  }

  async function install() {
    if (!update) return;
    installing = true;
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
      installing = false;
    }
  }

  function toggleNotifications() {
    notifications = !notifications;
    localStorage.setItem(NOTIF_KEY, notifications ? "on" : "off");
  }

  async function doDelete() {
    deleting = true;
    error = null;
    try {
      await deleteAccount();
      window.location.reload();
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
      deleting = false;
    }
  }
</script>

<div class="backdrop" role="button" tabindex="-1" aria-label="Close" onclick={onClose} onkeydown={(e) => e.key === "Escape" && onClose()}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="Settings">
  <div class="dhead">
    <h2>Settings</h2>
    <button class="x" onclick={onClose} aria-label="Close">×</button>
  </div>

  <section class="card">
    <h3>Version &amp; updates</h3>
    <div class="row"><span>This app</span><span class="mono">v{APP_VERSION}</span></div>
    <div class="row">
      <span>Updates</span>
      {#if checking}
        <span class="muted">Checking…</span>
      {:else if update}
        <span class="new">v{update.version} available</span>
      {:else if checkedOnce}
        <span class="muted">Up to date</span>
      {/if}
    </div>
    <div class="actions">
      <button class="ghost small" onclick={doCheck} disabled={checking}>Check now</button>
      {#if update}
        <button class="primary small" onclick={install} disabled={installing}>{installing ? "Installing…" : "Install & restart"}</button>
      {/if}
    </div>
  </section>

  <section class="card">
    <h3>Notifications</h3>
    <div class="row">
      <div>
        <div>Desktop notifications</div>
        <div class="muted small">Alerts for mentions and activity.</div>
      </div>
      <button class="toggle" class:on={notifications} onclick={toggleNotifications} role="switch" aria-checked={notifications} aria-label="Toggle notifications">
        <span class="knob"></span>
      </button>
    </div>
  </section>

  <section class="card">
    <h3>Account</h3>
    <div class="row"><span>Signed in as</span><span class="muted">{auth.user?.email}</span></div>
  </section>

  <section class="card danger">
    <h3>Danger zone</h3>
    {#if !confirmDelete}
      <p class="muted small">Deleting your account removes your profile, memberships and every team you own. This can't be undone.</p>
      <button class="danger-btn" onclick={() => (confirmDelete = true)}>Delete my account…</button>
    {:else}
      <p class="small">Permanently delete your account and everything you own?</p>
      {#if error}<p class="error small">{error}</p>{/if}
      <div class="actions">
        <button class="ghost small" onclick={() => (confirmDelete = false)} disabled={deleting}>Cancel</button>
        <button class="danger-btn" onclick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete permanently"}</button>
      </div>
    {/if}
    {#if error && !confirmDelete}<p class="error small">{error}</p>{/if}
  </section>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 60;
    border: none;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 20px;
    z-index: 61;
  }
  .dhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  h2 {
    font-size: 18px;
  }
  .x {
    background: transparent;
    border: none;
    font-size: 22px;
    color: var(--text-muted);
    line-height: 1;
  }
  .card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 12px;
  }
  h3 {
    font-size: 13px;
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }
  .row:first-of-type {
    border-top: none;
  }
  .mono {
    font-family: ui-monospace, monospace;
  }
  .new {
    color: var(--accent);
    font-weight: 600;
  }
  .small {
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 8px;
  }
  .toggle {
    width: 42px;
    height: 24px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .toggle.on .knob {
    transform: translateX(18px);
  }
  .danger h3 {
    color: var(--danger, #f87171);
  }
  .danger-btn {
    background: transparent;
    border: 1px solid var(--danger, #f87171);
    color: var(--danger, #f87171);
    border-radius: 8px;
    padding: 7px 13px;
    font-size: 13px;
    font-weight: 600;
  }
  .danger-btn:hover:not(:disabled) {
    background: var(--danger, #f87171);
    color: #fff;
  }
</style>
