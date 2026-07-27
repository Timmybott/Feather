<script lang="ts">
  import { onMount } from "svelte";
  import { auth, signOut } from "../../src/lib/auth.svelte";
  import { deleteAccount } from "../../src/lib/cloud";
  import { APP_VERSION } from "../../src/lib/version";
  import { latestRelease, LATEST_RELEASE_URL, type Release } from "../lib/github";
  import { navigate } from "../lib/router.svelte";

  const NOTIF_KEY = "feather.notifications";

  let latest = $state<Release | null>(null);
  let checking = $state(true);
  let notifications = $state(false);
  let confirmDelete = $state(false);
  let deleting = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    notifications = localStorage.getItem(NOTIF_KEY) === "on";
    latest = await latestRelease();
    checking = false;
  });

  // Compare "3.3.0" with a tag like "v3.4.0".
  const updateAvailable = $derived.by(() => {
    if (!latest) return false;
    return latest.tag.replace(/^v/, "") !== APP_VERSION;
  });

  async function toggleNotifications() {
    const next = !notifications;
    if (next && "Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore — the toggle still records the preference
      }
    }
    notifications = next;
    localStorage.setItem(NOTIF_KEY, next ? "on" : "off");
  }

  async function doDelete() {
    deleting = true;
    error = null;
    try {
      await deleteAccount();
      navigate("/");
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
      deleting = false;
    }
  }

  async function logout() {
    await signOut();
    navigate("/");
  }
</script>

<div class="settings">
  <h1>Settings</h1>

  {#if !auth.user}
    <p class="muted">You're signed out. <button class="link" onclick={() => navigate("/login")}>Sign in</button> to manage your account.</p>
  {:else}
    <section class="card">
      <h2>Version &amp; updates</h2>
      <div class="row">
        <span>This app</span>
        <span class="mono">v{APP_VERSION}</span>
      </div>
      <div class="row">
        <span>Latest release</span>
        {#if checking}
          <span class="muted">Checking…</span>
        {:else if latest}
          <a class="mono" href={latest.htmlUrl} target="_blank" rel="noopener noreferrer">{latest.tag}</a>
        {:else}
          <span class="muted">Unknown</span>
        {/if}
      </div>
      {#if !checking}
        {#if updateAvailable}
          <p class="update">An update is available. <a href={LATEST_RELEASE_URL} target="_blank" rel="noopener noreferrer">Get the desktop app →</a></p>
        {:else if latest}
          <p class="muted small">You're on the latest version.</p>
        {/if}
      {/if}
    </section>

    <section class="card">
      <h2>Notifications</h2>
      <div class="row">
        <div>
          <div>Browser notifications</div>
          <div class="muted small">Alerts for mentions and activity (when supported).</div>
        </div>
        <button class="toggle" class:on={notifications} onclick={toggleNotifications} role="switch" aria-checked={notifications} aria-label="Toggle browser notifications">
          <span class="knob"></span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2>Account</h2>
      <div class="row">
        <span>Signed in as</span>
        <span class="muted">{auth.user.email}</span>
      </div>
      <div class="row">
        <span>Sign out</span>
        <button class="ghost" onclick={logout}>Log out</button>
      </div>
    </section>

    <section class="card danger">
      <h2>Danger zone</h2>
      {#if !confirmDelete}
        <p class="muted small">Deleting your account removes your profile, your memberships, and every team you own (with its projects, panels, deploys and issues). This can't be undone.</p>
        <button class="danger-btn" onclick={() => (confirmDelete = true)}>Delete my account…</button>
      {:else}
        <p class="small">This permanently deletes your account and everything you own. Are you sure?</p>
        {#if error}<p class="error small">{error}</p>{/if}
        <div class="actions">
          <button class="ghost" onclick={() => (confirmDelete = false)} disabled={deleting}>Cancel</button>
          <button class="danger-btn" onclick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete permanently"}</button>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .settings {
    max-width: 640px;
    margin: 0 auto;
  }

  h1 {
    font-size: 26px;
    margin-bottom: 20px;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    margin-bottom: 16px;
  }

  h2 {
    font-size: 14px;
    margin-bottom: 12px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }

  .row:first-of-type {
    border-top: none;
  }

  .mono {
    font-family: ui-monospace, monospace;
  }

  a.mono {
    color: var(--accent);
  }

  .small {
    font-size: 12px;
  }

  .update {
    font-size: 13px;
    margin-top: 8px;
  }

  .update a {
    color: var(--accent);
  }

  .toggle {
    width: 42px;
    height: 24px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    position: relative;
    flex-shrink: 0;
    transition: background 0.15s;
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

  .danger {
    border-color: color-mix(in srgb, var(--danger, #f87171) 40%, var(--border));
  }

  .danger h2 {
    color: var(--danger, #f87171);
  }

  .danger-btn {
    background: transparent;
    border: 1px solid var(--danger, #f87171);
    color: var(--danger, #f87171);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
  }

  .danger-btn:hover:not(:disabled) {
    background: var(--danger, #f87171);
    color: #fff;
  }

  .actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
  }
</style>
