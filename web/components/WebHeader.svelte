<script lang="ts">
  import { auth, signOut } from "../../src/lib/auth.svelte";
  import { getProfile, listUserTeams, type Team, type UserProfile } from "../../src/lib/cloud";
  import Logo from "../../src/lib/components/Logo.svelte";
  import { navigate } from "../lib/router.svelte";

  let { query = "" }: { query?: string } = $props();

  let q = $state("");
  // Reflect the active search term (from the URL) in the box.
  $effect(() => {
    q = query;
  });

  let profile = $state<UserProfile | null>(null);
  let teams = $state<Team[]>([]);
  let menuOpen = $state(false);
  let avatarBroken = $state(false);

  // Load the signed-in user's profile (for the avatar) and their teams for the
  // dropdown. Re-runs when the account changes; clears on sign-out.
  $effect(() => {
    const id = auth.user?.id;
    if (!id) {
      profile = null;
      teams = [];
      return;
    }
    avatarBroken = false;
    void getProfile(id)
      .then((p) => (profile = p))
      .catch(() => (profile = null));
    void listUserTeams(id)
      .then((t) => (teams = t))
      .catch(() => (teams = []));
  });

  const initial = $derived(
    (profile?.display_name || profile?.username || auth.user?.email || "?").charAt(0).toUpperCase(),
  );

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  function go(path: string) {
    menuOpen = false;
    navigate(path);
  }

  async function logout() {
    menuOpen = false;
    await signOut();
    navigate("/");
  }

  // Close the dropdown when clicking anywhere outside it.
  function onWindowClick(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest(".account")) menuOpen = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<header class="webhead">
  <button class="brand" onclick={() => navigate("/")} title="Feather home">
    <Logo size={26} />
    <span>Feather</span>
  </button>

  <form class="search" onsubmit={submitSearch}>
    <input bind:value={q} placeholder="Search teams, users, projects…" spellcheck="false" autocomplete="off" />
  </form>

  <div class="right">
    {#if auth.user}
      <div class="account">
        <button class="avatar-btn" onclick={() => (menuOpen = !menuOpen)} title="Your account" aria-haspopup="menu" aria-expanded={menuOpen}>
          {#if profile?.avatar_url && !avatarBroken}
            <img class="avatar" src={profile.avatar_url} alt="" onerror={() => (avatarBroken = true)} />
          {:else}
            <span class="avatar placeholder">{initial}</span>
          {/if}
        </button>

        {#if menuOpen}
          <div class="menu" role="menu">
            <div class="menu-id">
              <span class="menu-name">{profile?.display_name || profile?.username || "You"}</span>
              {#if profile?.username}<span class="menu-handle">@{profile.username}</span>{/if}
            </div>
            <button class="menu-item" role="menuitem" onclick={() => go(`/user/${profile?.username ?? auth.user?.id ?? ""}`)}>Your profile</button>
            <button class="menu-item" role="menuitem" onclick={() => go("/settings")}>Settings</button>

            <div class="menu-section">Your teams</div>
            {#if teams.length === 0}
              <div class="menu-empty">No teams yet</div>
            {:else}
              {#each teams as t (t.id)}
                <button class="menu-item team" role="menuitem" onclick={() => go(`/team/${t.slug ?? t.id}`)}>
                  {#if t.logo_url}<img class="team-logo" src={t.logo_url} alt="" />{:else}<span class="team-logo ph">{t.name.charAt(0).toUpperCase()}</span>{/if}
                  <span class="team-name">{t.name}</span>
                </button>
              {/each}
            {/if}

            <div class="menu-divider"></div>
            <button class="menu-item danger" role="menuitem" onclick={logout}>Log out</button>
          </div>
        {/if}
      </div>
    {:else}
      <button class="primary" onclick={() => navigate("/login")}>Sign in</button>
    {/if}
  </div>
</header>

<style>
  .webhead {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    background: transparent;
    border: none;
    padding: 4px;
    font-size: 16px;
    font-weight: 700;
  }

  .search {
    flex: 1;
    max-width: 520px;
  }

  .search input {
    width: 100%;
    padding: 7px 12px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .account {
    position: relative;
  }

  .avatar-btn {
    background: transparent;
    border: none;
    padding: 0;
    border-radius: 50%;
    line-height: 0;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--border);
    display: block;
  }

  .avatar.placeholder {
    display: grid;
    place-items: center;
    background: var(--accent);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
  }

  .avatar-btn:hover .avatar {
    border-color: var(--accent);
  }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 220px;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    padding: 6px;
    z-index: 30;
  }

  .menu-id {
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 6px;
  }

  .menu-name {
    font-weight: 700;
    font-size: 14px;
  }

  .menu-handle {
    font-size: 12px;
    color: var(--text-muted);
  }

  .menu-item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .menu-item:hover {
    background: var(--surface-2);
  }

  .menu-section {
    padding: 10px 10px 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .menu-empty {
    padding: 4px 10px 8px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .team-logo {
    width: 20px;
    height: 20px;
    border-radius: 5px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .team-logo.ph {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    font-size: 11px;
    font-weight: 700;
  }

  .team-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-divider {
    height: 1px;
    background: var(--border);
    margin: 6px 4px;
  }

  .menu-item.danger {
    color: var(--danger, #f87171);
  }
</style>
