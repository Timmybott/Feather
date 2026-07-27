<script lang="ts">
  import { onMount } from "svelte";
  import { auth, initAuth } from "../src/lib/auth.svelte";
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

  const openTeam = (teamId: string) => navigate(`/t/${teamId}`);
  const openProject = (projectId: string) => navigate(`/p/${projectId}`);
  const openProfile = (userId: string) => navigate(`/u/${userId}`);
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
    {#key route.id}
      <UserProfile userId={route.id} onBack={back} onOpenTeam={openTeam} onOpenProject={openProject} />
    {/key}
  {:else if route.page === "team"}
    {#key route.id}
      <TeamProfile teamId={route.id} onBack={back} onDeleted={() => navigate("/")} onOpenProfile={openProfile} onOpenProject={openProject} />
    {/key}
  {:else if route.page === "project"}
    {#key route.id}
      <WebProject projectId={route.id} />
    {/key}
  {/if}
</main>

<style>
  .login-wrap {
    max-width: 420px;
    margin: 0 auto;
  }
</style>
