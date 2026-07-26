<script lang="ts">
  import { auth } from "../../src/lib/auth.svelte";
  import {
    getProject,
    getTeam,
    listDeploys,
    listIssues,
    listMembers,
    type CloudProject,
    type DeployEntry,
    type Issue,
    type TeamMember,
  } from "../../src/lib/cloud";
  import FileBrowser from "../../src/lib/components/FileBrowser.svelte";
  import IssuesPanel from "../../src/lib/components/IssuesPanel.svelte";
  import Markdown from "../../src/lib/components/Markdown.svelte";
  import ProjectHistory from "../../src/lib/components/ProjectHistory.svelte";
  import { serverKind, type ServerKind } from "../../src/lib/serverType";
  import { openInDesktop } from "../lib/desktop";
  import { panelJson } from "../lib/panel";
  import { navigate } from "../lib/router.svelte";
  import WebConsole from "./WebConsole.svelte";

  let { projectId }: { projectId: string } = $props();

  type Tab = "overview" | "issues" | "files" | "history" | "console";
  let tab = $state<Tab>("overview");

  let project = $state<CloudProject | null>(null);
  let teamName = $state("");
  let members = $state<TeamMember[]>([]);
  let issues = $state<Issue[]>([]);
  let deploys = $state<DeployEntry[]>([]);
  let kind = $state<ServerKind | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const isMember = $derived(
    !!auth.user && members.some((m) => m.user_id === auth.user!.id),
  );
  const hasServer = $derived(!!project?.panel_id && !!project?.server_identifier);
  const openIssues = $derived(issues.filter((i) => i.status === "open").length);

  async function load() {
    loading = true;
    error = null;
    tab = "overview";
    try {
      const p = await getProject(projectId);
      project = p;
      const [team, m, iss, dep] = await Promise.all([
        getTeam(p.team_id).catch(() => null),
        listMembers(p.team_id).catch(() => [] as TeamMember[]),
        listIssues(p.id).catch(() => [] as Issue[]),
        listDeploys(p.id).catch(() => [] as DeployEntry[]),
      ]);
      teamName = team?.name ?? "";
      members = m;
      issues = iss;
      deploys = dep;
      // The server's kind (Node.js, Website, …) from its Docker image.
      kind = null;
      if (p.panel_id && p.server_identifier) {
        void panelJson<{ attributes?: { docker_image?: string; invocation?: string } }>({
          action: "details",
          panel: p.panel_id,
          server: p.server_identifier,
        })
          .then((d) => (kind = serverKind(d.attributes?.docker_image, d.attributes?.invocation)))
          .catch(() => (kind = null));
      }
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void projectId;
    void load();
  });

  const noop = () => {};
</script>

{#if loading}
  <p class="muted center">Loading project…</p>
{:else if error || !project}
  <p class="error center">{error ?? "This project is not available."}</p>
{:else}
  <div class="detail">
    <header class="project-head">
      {#if project.logo_url}
        <img class="proj-logo" src={project.logo_url} alt={project.name} />
      {:else}
        <span class="proj-logo placeholder">{project.name.charAt(0).toUpperCase()}</span>
      {/if}
      <div class="head-text">
        <h1>{project.name}</h1>
        <div class="subline">
          <button class="team-chip" onclick={() => navigate(`/t/${project!.team_id}`)}>{teamName}</button>
          <span class="tag readonly" title="Read-only on the web">Web · read-only</span>
          {#if kind}
            <span class="tag kind" title="Server type (inferred from the panel)">{kind.label}</span>
          {/if}
          {#if project.server_identifier}
            <span class="tag mono">{project.server_identifier}</span>
          {/if}
        </div>
      </div>
      <button
        class="desktop-btn"
        onclick={() => openInDesktop(`project/${project!.id}`)}
        title="Open this project in the Feather desktop app to commit and deploy"
      >
        Open in desktop app ↗
      </button>
    </header>

    <nav class="subtabs">
      <button class:active={tab === "overview"} onclick={() => (tab = "overview")}>Overview</button>
      <button class:active={tab === "issues"} onclick={() => (tab = "issues")}>Issues</button>
      <button class:active={tab === "history"} onclick={() => (tab = "history")}>History</button>
      <!-- Files and the live console reach the team's panel, which is
           members-only — the feather-panel proxy rejects non-members. Only
           show these tabs to a signed-in member of the owning team. -->
      {#if hasServer && isMember}
        <button class:active={tab === "files"} onclick={() => (tab = "files")}>Files</button>
        <button class:active={tab === "console"} onclick={() => (tab = "console")}>Console</button>
      {/if}
    </nav>

    {#if tab === "overview"}
      <div class="stats">
        <div class="stat"><span class="stat-num">{openIssues}</span><span class="stat-label muted">Open {openIssues === 1 ? "issue" : "issues"}</span></div>
        <div class="stat"><span class="stat-num">{deploys.length}</span><span class="stat-label muted">{deploys.length === 1 ? "Deploy" : "Deploys"}</span></div>
        <div class="stat"><span class="stat-num">{members.length}</span><span class="stat-label muted">{members.length === 1 ? "Member" : "Members"}</span></div>
      </div>
      <div class="card">
        <h2>About</h2>
        {#if project.description.trim() !== ""}
          <Markdown source={project.description} />
        {:else}
          <p class="muted">No description yet.</p>
        {/if}
      </div>
      {#if !isMember}
        <p class="hint muted">You're viewing this project on the web. Sign in as a team member to edit files, use the console or open issues. The desktop app adds committing and deploying.</p>
      {/if}
    {:else if tab === "issues"}
      <IssuesPanel projectId={project.id} canWrite={false} canInteract={isMember} onOpenProfile={(id) => navigate(`/u/${id}`)} />
    {:else if tab === "files" && hasServer && isMember}
      <FileBrowser panelId={project.panel_id!} identifier={project.server_identifier!} canWrite={isMember} />
    {:else if tab === "console" && hasServer && isMember}
      <WebConsole panelId={project.panel_id!} identifier={project.server_identifier!} serverName={project.name} onClose={() => (tab = "overview")} />
    {:else if tab === "history"}
      <ProjectHistory {project} onRollback={noop} onClose={() => (tab = "overview")} canWrite={false} />
    {/if}
  </div>
{/if}

<style>
  .detail {
    max-width: 900px;
    margin: 0 auto;
  }

  .project-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }

  .desktop-btn {
    margin-left: auto;
    flex-shrink: 0;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 13px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .desktop-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .proj-logo {
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    border-radius: 11px;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .proj-logo.placeholder {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    font-weight: 700;
    font-size: 22px;
  }

  h1 {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .subline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13px;
  }

  .team-chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 3px 11px;
    font-size: 12px;
    font-weight: 600;
  }

  .team-chip:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tag {
    font-size: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px 9px;
  }

  .tag.readonly {
    color: var(--warn, #fbbf24);
    border-color: color-mix(in srgb, var(--warn, #fbbf24) 45%, transparent);
  }

  .tag.kind {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .mono {
    font-family: ui-monospace, monospace;
  }

  .subtabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 22px;
  }

  .subtabs button {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    padding: 8px 12px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
  }

  .subtabs button:hover {
    color: var(--text);
  }

  .subtabs button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 22px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
  }

  .stat-num {
    font-size: 22px;
    font-weight: 700;
    line-height: 1.1;
  }

  .stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
    margin-bottom: 16px;
  }

  h2 {
    font-size: 14px;
    margin-bottom: 12px;
  }

  .hint {
    font-size: 13px;
    line-height: 1.5;
  }
</style>
