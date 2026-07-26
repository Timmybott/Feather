<script lang="ts">
  import { auth, signOut } from "../../src/lib/auth.svelte";
  import Logo from "../../src/lib/components/Logo.svelte";
  import { navigate } from "../lib/router.svelte";

  let { query = "" }: { query?: string } = $props();

  let q = $state("");
  // Reflect the active search term (from the URL) in the box.
  $effect(() => {
    q = query;
  });

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  async function logout() {
    await signOut();
    navigate("/");
  }
</script>

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
      <button class="ghost" onclick={() => navigate(`/u/${auth.user?.id ?? ""}`)}>Your profile</button>
      <button class="ghost" onclick={logout}>Log out</button>
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
</style>
