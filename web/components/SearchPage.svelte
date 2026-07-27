<script lang="ts">
  import type { CloudProject, Team, UserProfile } from "../../src/lib/cloud";
  import { navigate } from "../lib/router.svelte";
  import { searchProjects, searchTeams, searchUsers } from "../lib/search";

  let { q }: { q: string } = $props();

  type Tab = "projects" | "teams" | "users";
  let tab = $state<Tab>("projects");

  let teams = $state<Team[]>([]);
  let users = $state<UserProfile[]>([]);
  let projects = $state<CloudProject[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const term = q.trim();
    if (term === "") {
      teams = [];
      users = [];
      projects = [];
      return;
    }
    loading = true;
    error = null;
    Promise.all([searchProjects(term), searchTeams(term), searchUsers(term)])
      .then(([p, t, u]) => {
        projects = p;
        teams = t;
        users = u;
      })
      .catch((e) => (error = String(e instanceof Error ? e.message : e)))
      .finally(() => (loading = false));
  });

  function userName(u: UserProfile): string {
    return u.display_name?.trim() || u.username || "Unknown";
  }
</script>

<div class="web-main search">
  <h1>Search{#if q.trim()} <span class="muted">for "{q.trim()}"</span>{/if}</h1>

  <nav class="tabs">
    <button class:active={tab === "projects"} onclick={() => (tab = "projects")}>Projects <span class="count">{projects.length}</span></button>
    <button class:active={tab === "teams"} onclick={() => (tab = "teams")}>Teams <span class="count">{teams.length}</span></button>
    <button class:active={tab === "users"} onclick={() => (tab = "users")}>Users <span class="count">{users.length}</span></button>
  </nav>

  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}
    <p class="muted center">Searching…</p>
  {:else if q.trim() === ""}
    <p class="muted center">Type something to search.</p>
  {:else if tab === "projects"}
    {#if projects.length === 0}
      <p class="muted center">No projects found.</p>
    {:else}
      <ul class="list">
        {#each projects as p (p.id)}
          <li>
            <button class="row" onclick={() => navigate(`/project/${p.slug ?? p.id}`)}>
              {#if p.logo_url}<img class="ic" src={p.logo_url} alt="" />{:else}<span class="ic ph">{p.name.charAt(0).toUpperCase()}</span>{/if}
              <span class="main"><span class="name">{p.name}</span><span class="muted sub">{p.description || "No description"}</span></span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tab === "teams"}
    {#if teams.length === 0}
      <p class="muted center">No teams found.</p>
    {:else}
      <ul class="list">
        {#each teams as t (t.id)}
          <li>
            <button class="row" onclick={() => navigate(`/team/${t.slug ?? t.id}`)}>
              {#if t.logo_url}<img class="ic" src={t.logo_url} alt="" />{:else}<span class="ic ph">{t.name.charAt(0).toUpperCase()}</span>{/if}
              <span class="main"><span class="name">{t.name}</span><span class="muted sub">{t.description || "Team"}</span></span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if users.length === 0}
    <p class="muted center">No users found.</p>
  {:else}
    <ul class="list">
      {#each users as u (u.id)}
        <li>
          <button class="row" onclick={() => navigate(`/user/${u.username ?? u.id}`)}>
            {#if u.avatar_url}<img class="ic round" src={u.avatar_url} alt="" />{:else}<span class="ic ph round">{userName(u).charAt(0).toUpperCase()}</span>{/if}
            <span class="main"><span class="name">{userName(u)}</span>{#if u.username}<span class="muted sub">@{u.username}</span>{/if}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  h1 {
    font-size: 22px;
    margin-bottom: 16px;
  }

  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 18px;
  }

  .tabs button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 8px 12px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .tabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .count {
    font-size: 11px;
    background: var(--surface-2);
    border-radius: 20px;
    padding: 0 7px;
  }

  .list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .row:hover {
    border-color: var(--accent);
  }

  .ic {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    object-fit: cover;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .ic.round {
    border-radius: 50%;
  }

  .ic.ph {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    font-weight: 700;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    font-size: 14px;
  }

  .sub {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
