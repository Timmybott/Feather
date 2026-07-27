<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onMount } from "svelte";
  import { auth, initAuth, signOut } from "./lib/auth.svelte";
  import { listTeams } from "./lib/cloud";
  import { clearActiveTeam, setActiveTeam, teamState } from "./lib/team.svelte";
  import AppShell from "./lib/components/AppShell.svelte";
  import AuthScreen from "./lib/components/AuthScreen.svelte";
  import TeamSetup from "./lib/components/TeamSetup.svelte";

  let resolving = $state(false);

  onMount(() => {
    void initAuth();

    // In the Tauri webview, clicking an http(s) link (e.g. in a Markdown README
    // or issue) would navigate the app window and break it. Intercept those and
    // open them in the system browser instead.
    function onLinkClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement)?.closest?.("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        event.preventDefault();
        void openUrl(href).catch(() => {});
      }
    }
    document.addEventListener("click", onLinkClick);
    return () => document.removeEventListener("click", onLinkClick);
  });

  // On restart only the team id is persisted. Resolve its name and, at the
  // same time, validate the membership is still valid — a stale id (team
  // deleted, or removed from it) sends the user back to the team picker.
  $effect(() => {
    const id = teamState.activeTeamId;
    if (auth.user && id && teamState.activeTeamName === null && !resolving) {
      resolving = true;
      listTeams()
        .then((teams) => {
          const team = teams.find((t) => t.id === id);
          // Stale id (team deleted / removed) or unreachable → back to picker.
          if (team) setActiveTeam(team);
          else clearActiveTeam();
        })
        .catch(() => clearActiveTeam())
        .finally(() => (resolving = false));
    }
  });

  async function logout() {
    clearActiveTeam();
    await signOut();
  }
</script>

{#if auth.loading}
  <p class="muted center">Loading…</p>
{:else if !auth.user}
  <AuthScreen />
{:else if teamState.activeTeamId && teamState.activeTeamName === null}
  <!-- Restoring the persisted team (resolving its name / membership). -->
  <p class="muted center">Loading…</p>
{:else if !teamState.activeTeamId}
  <TeamSetup onReady={() => {}} />
{:else}
  <AppShell
    userEmail={auth.user.email ?? ""}
    teamName={teamState.activeTeamName ?? ""}
    onSwitchTeam={clearActiveTeam}
    onLogout={logout}
  />
{/if}
