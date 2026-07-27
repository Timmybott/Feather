<script lang="ts">
  import { onMount } from "svelte";
  import { auth, initAuth } from "../src/lib/auth.svelte";
  import { looksLikeId, resolveProjectId, resolveTeamId, resolveUserId } from "../src/lib/cloud";
  import AuthScreen from "../src/lib/components/AuthScreen.svelte";
  import TeamProfile from "../src/lib/components/TeamProfile.svelte";
  import UserProfile from "../src/lib/components/UserProfile.svelte";
  import Home from "./components/Home.svelte";
  import SearchPage from "./components/SearchPage.svelte";
  import Settings from "./components/Settings.svelte";
  import WebHeader from "./components/WebHeader.svelte";
  import WebProject from "./components/WebProject.svelte";
  import { back, navigate, parse, router } from "./lib/router.svelte";

  onMount(() => void initAuth());

  const route = $derived(parse(router.path));

  // Once signed in, don't sit on the login page.
  $effect(() => {
    if (route.page === "login" && auth.user) navigate("/");
  });

  // The URL param for a user/team/project may be a slug or username, not a uuid.
  // Resolve it to an id for the (id-based) profile components. A uuid resolves
  // synchronously (no flash); a slug is looked up. "__notfound__" marks a miss.
  const NOT_FOUND = "__notfound__";
  let resolvedId = $state<string | null>(null);
  $effect(() => {
    const r = route;
    if (r.page !== "user" && r.page !== "team" && r.page !== "project") return;
    if (looksLikeId(r.id)) {
      resolvedId = r.id;
      return;
    }
    resolvedId = null;
    const wanted = r.id;
    const lookup =
      r.page === "user"
        ? resolveUserId(r.id)
        : r.page === "team"
          ? resolveTeamId(r.id)
          : resolveProjectId(r.id);
    void lookup
      .then((id) => {
        if (parse(router.path).id === wanted) resolvedId = id;
      })
      .catch(() => {
        if (parse(router.path).id === wanted) resolvedId = NOT_FOUND;
      });
  });

  const openTeam = (team: string) => navigate(`/team/${team}`);
  const openProject = (project: string) => navigate(`/project/${project}`);
  const openProfile = (user: string) => navigate(`/user/${user}`);
</script>

<WebHeader query={route.page === "search" ? (route.query.get("q") ?? "") : ""} />

<main class="web-main">
  {#if route.page === "home"}
    <Home />
  {:else if route.page === "search"}
    <SearchPage q={route.query.get("q") ?? ""} />
  {:else if route.page === "login"}
    <div class="login-wrap"><AuthScreen /></div>
  {:else if route.page === "settings"}
    <Settings />
  {:else if route.page === "user"}
    {#if resolvedId === NOT_FOUND}
      <p class="state">User not found.</p>
    {:else if resolvedId}
      {#key resolvedId}
        <UserProfile userId={resolvedId} onBack={back} onOpenTeam={openTeam} onOpenProject={openProject} />
      {/key}
    {:else}
      <p class="state muted">Loading…</p>
    {/if}
  {:else if route.page === "team"}
    {#if resolvedId === NOT_FOUND}
      <p class="state">Team not found.</p>
    {:else if resolvedId}
      {#key resolvedId}
        <TeamProfile teamId={resolvedId} onBack={back} onDeleted={() => navigate("/")} onOpenProfile={openProfile} onOpenProject={openProject} />
      {/key}
    {:else}
      <p class="state muted">Loading…</p>
    {/if}
  {:else if route.page === "project"}
    {#if resolvedId === NOT_FOUND}
      <p class="state">Project not found.</p>
    {:else if resolvedId}
      {#key resolvedId}
        <WebProject projectId={resolvedId} />
      {/key}
    {:else}
      <p class="state muted">Loading…</p>
    {/if}
  {/if}
</main>

<style>
  .login-wrap {
    max-width: 420px;
    margin: 0 auto;
  }

  .state {
    text-align: center;
    padding: 48px 0;
  }
</style>
