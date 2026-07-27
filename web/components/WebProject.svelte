<script lang="ts">
  import { auth } from "../../src/lib/auth.svelte";
  import {
    getProject,
    getTeam,
    listDeploys,
    listIssues,
    listMembers,
    publishWebDeployment,
    setWebDeploy,
    unpublishWebDeployment,
    updateProject,
    webDeployUrl,
    WEB_DEPLOY_BASE,
    type CloudProject,
    type DeployEntry,
    type Issue,
    type TeamMember,
  } from "../../src/lib/cloud";
  import FileBrowser from "../../src/lib/components/FileBrowser.svelte";
  import ImagePicker from "../../src/lib/components/ImagePicker.svelte";
  import IssuesPanel from "../../src/lib/components/IssuesPanel.svelte";
  import Markdown from "../../src/lib/components/Markdown.svelte";
  import MarkdownEditor from "../../src/lib/components/MarkdownEditor.svelte";
  import PlanningTab from "../../src/lib/components/PlanningTab.svelte";
  import ProjectHistory from "../../src/lib/components/ProjectHistory.svelte";
  import { serverKind, type ServerKind } from "../../src/lib/serverType";
  import { openInDesktop } from "../lib/desktop";
  import { panelJson } from "../lib/panel";
  import { navigate } from "../lib/router.svelte";
  import WebConsole from "./WebConsole.svelte";

  let { projectId }: { projectId: string } = $props();

  type Tab = "overview" | "issues" | "planning" | "files" | "history" | "console" | "settings";
  let tab = $state<Tab>("overview");

  let project = $state<CloudProject | null>(null);
  let teamName = $state("");
  let teamSlug = $state<string | null>(null);
  let members = $state<TeamMember[]>([]);
  let issues = $state<Issue[]>([]);
  let deploys = $state<DeployEntry[]>([]);
  let kind = $state<ServerKind | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const isMember = $derived(
    !!auth.user && members.some((m) => m.user_id === auth.user!.id),
  );
  const isAdmin = $derived(
    !!auth.user &&
      members.some((m) => m.user_id === auth.user!.id && (m.role === "owner" || m.role === "admin")),
  );
  const hasServer = $derived(!!project?.panel_id && !!project?.server_identifier);
  const openIssues = $derived(issues.filter((i) => i.status === "open").length);

  // Overview stats + activity (parity with the desktop project page).
  const lastDeploy = $derived<DeployEntry | null>(deploys[0] ?? null);
  const lastSuccess = $derived<DeployEntry | null>(deploys.find((d) => d.status === "success") ?? null);
  const currentCommit = $derived(lastSuccess?.commit ?? null);
  const recentDeploys = $derived(deploys.slice(0, 5));
  const creatorName = $derived.by(() => {
    const c = members.find((m) => m.user_id === project?.created_by);
    return c?.display_name?.trim() || c?.username || null;
  });

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  function deployActor(d: DeployEntry): string {
    return d.display_name?.trim() || d.username || "Someone";
  }
  function createdDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  // Settings (members only): edit metadata + web deployment.
  let sName = $state("");
  let sDescription = $state("");
  let sLogo = $state("");
  let savingSettings = $state(false);
  let settingsError = $state<string | null>(null);
  let webBusy = $state(false);

  function openSettings() {
    if (!project) return;
    sName = project.name;
    sDescription = project.description;
    sLogo = project.logo_url ?? "";
    settingsError = null;
    tab = "settings";
  }

  async function saveSettings() {
    if (!project || sName.trim() === "") return;
    savingSettings = true;
    settingsError = null;
    try {
      project = await updateProject(project.id, {
        name: sName.trim(),
        description: sDescription,
        logo_url: sLogo.trim() || null,
      });
    } catch (e) {
      settingsError = String(e instanceof Error ? e.message : e);
    } finally {
      savingSettings = false;
    }
  }

  async function toggleAutoPublish() {
    if (!project) return;
    try {
      const next = !project.web_auto_publish;
      project = await updateProject(project.id, { web_auto_publish: next });
    } catch (e) {
      settingsError = String(e instanceof Error ? e.message : e);
    }
  }

  async function enableWeb() {
    if (!project) return;
    webBusy = true;
    settingsError = null;
    try {
      const slug = await setWebDeploy(project.id, true);
      project = { ...project, web_deploy: true, web_slug: slug };
      if (slug) await publishWebDeployment(project.id, slug);
    } catch (e) {
      settingsError = String(e instanceof Error ? e.message : e);
    } finally {
      webBusy = false;
    }
  }
  async function republishWeb() {
    if (!project?.web_slug) return;
    webBusy = true;
    settingsError = null;
    try {
      await publishWebDeployment(project.id, project.web_slug);
    } catch (e) {
      settingsError = String(e instanceof Error ? e.message : e);
    } finally {
      webBusy = false;
    }
  }
  async function disableWeb() {
    if (!project) return;
    webBusy = true;
    try {
      const slug = project.web_slug;
      await setWebDeploy(project.id, false);
      project = { ...project, web_deploy: false };
      if (slug) await unpublishWebDeployment(project.id, slug).catch(() => {});
    } catch (e) {
      settingsError = String(e instanceof Error ? e.message : e);
    } finally {
      webBusy = false;
    }
  }

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
      teamSlug = team?.slug ?? null;
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
          <button class="team-chip" onclick={() => navigate(`/team/${teamSlug ?? project!.team_id}`)}>{teamName}</button>
          <span class="tag readonly" title="Read-only on the web">Web · read-only</span>
          {#if kind}
            <span class="tag kind" title="Server type (inferred from the panel)">{kind.label}</span>
          {/if}
          {#if project.server_identifier}
            <span class="tag mono">{project.server_identifier}</span>
          {/if}
          {#if webDeployUrl(project)}
            <a class="tag live" href={webDeployUrl(project)} target="_blank" rel="noopener noreferrer" title="Open the live site">● Live ↗</a>
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
      {#if isMember}
        <button class:active={tab === "planning"} onclick={() => (tab = "planning")}>Planning</button>
      {/if}
      <button class:active={tab === "history"} onclick={() => (tab = "history")}>History</button>
      <!-- Files and the live console reach the team's panel, which is
           members-only — the feather-panel proxy rejects non-members. Only
           show these tabs to a signed-in member of the owning team. -->
      {#if hasServer && isMember}
        <button class:active={tab === "files"} onclick={() => (tab = "files")}>Files</button>
        <button class:active={tab === "console"} onclick={() => (tab = "console")}>Console</button>
      {/if}
      {#if isMember}
        <button class:active={tab === "settings"} onclick={openSettings}>Settings</button>
      {/if}
    </nav>

    {#if tab === "overview"}
      <div class="stats">
        <button class="stat" onclick={() => (tab = "issues")}>
          <span class="stat-num">{openIssues}</span><span class="stat-label muted">Open {openIssues === 1 ? "issue" : "issues"}</span>
        </button>
        <button class="stat" onclick={() => (tab = "history")}>
          <span class="stat-num">{deploys.length}</span><span class="stat-label muted">{deploys.length === 1 ? "Deploy" : "Deploys"}</span>
        </button>
        <div class="stat">
          {#if lastDeploy}
            <span class="stat-num sm"><span class="dot {lastDeploy.status}"></span>{relativeTime(lastDeploy.created_at)}</span>
            <span class="stat-label muted">Last {lastDeploy.kind}</span>
          {:else}
            <span class="stat-num sm muted">—</span><span class="stat-label muted">No deploys yet</span>
          {/if}
        </div>
        <div class="stat">
          {#if currentCommit}
            <span class="stat-num sm mono">{currentCommit.slice(0, 8)}</span><span class="stat-label muted">On the server</span>
          {:else}
            <span class="stat-num sm muted">—</span><span class="stat-label muted">Not deployed</span>
          {/if}
        </div>
      </div>

      <div class="ov-grid">
        <div class="ov-main">
          <div class="card">
            <h2>About</h2>
            {#if project.description.trim() !== ""}
              <Markdown source={project.description} />
            {:else}
              <p class="muted">No description yet.</p>
            {/if}
          </div>

          <div class="card">
            <h2>Recent activity</h2>
            {#if recentDeploys.length > 0}
              <ul class="activity">
                {#each recentDeploys as d (d.id)}
                  <li>
                    <span class="dot {d.status}"></span>
                    <span class="act-body">
                      <span class="act-title">{d.kind === "rollback" ? "Rollback" : "Deploy"}{#if d.message} <strong>{d.message}</strong>{/if}</span>
                      <span class="muted small">{deployActor(d)} · {relativeTime(d.created_at)}</span>
                    </span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="muted">No activity yet.</p>
            {/if}
          </div>
        </div>

        <aside class="ov-side">
          <div class="side-row">
            <span class="label muted">Team</span>
            <button class="inline-link" onclick={() => navigate(`/team/${teamSlug ?? project!.team_id}`)}>{teamName}</button>
          </div>
          {#if project.server_identifier}
            <div class="side-row"><span class="label muted">Server</span><span class="mono">{project.server_identifier}</span></div>
          {/if}
          {#if kind}
            <div class="side-row"><span class="label muted">Type</span><span>{kind.label}</span></div>
          {/if}
          <div class="side-row"><span class="label muted">Deploy target</span><span class="mono">{project.target_dir || "/"}</span></div>
          <div class="side-row"><span class="label muted">After deploy</span><span>{project.post_deploy === "restart" ? "Restart server" : "Notify only"}</span></div>
          {#if webDeployUrl(project)}
            <div class="side-row"><span class="label muted">Web deployment</span><a href={webDeployUrl(project)} target="_blank" rel="noopener noreferrer">Live ↗</a></div>
          {/if}
          <div class="side-row"><span class="label muted">Members</span><span>{members.length}</span></div>
          <div class="side-row"><span class="label muted">Created</span><span>{createdDate(project.created_at)}{#if creatorName} · {creatorName}{/if}</span></div>
        </aside>
      </div>

      {#if !isMember}
        <p class="hint muted">You're viewing this project on the web. Sign in as a team member to edit files, use the console, plan, or open issues. The desktop app adds committing and deploying.</p>
      {/if}
    {:else if tab === "settings" && isMember}
      <div class="settings">
        <div class="card">
          <h2>Project</h2>
          <div class="field"><label for="w-name">Name</label><input id="w-name" bind:value={sName} /></div>
          <div class="field"><span class="field-label">Logo</span><ImagePicker bind:value={sLogo} kind="logo" owner={project.id} shape="square" /></div>
          <div class="field"><label for="w-desc">Description <span class="muted">(Markdown)</span></label><MarkdownEditor id="w-desc" bind:value={sDescription} rows={6} /></div>
          <div class="row-end">
            <button class="primary" onclick={saveSettings} disabled={savingSettings || sName.trim() === ""}>{savingSettings ? "Saving…" : "Save"}</button>
          </div>
        </div>

        {#if hasServer}
          <div class="card">
            <h2>Web Deployments</h2>
            {#if kind && !kind.webCapable}
              <p class="muted small">This looks like a {kind.label} server. Web Deployments are best for website/Node/Python/… servers.</p>
            {/if}
            {#if !project.web_deploy}
              <p class="muted small">Publish this project's latest deploy online at <code>{WEB_DEPLOY_BASE}&lt;slug&gt;/</code>.</p>
              <button class="primary small" onclick={enableWeb} disabled={webBusy}>{webBusy ? "Publishing…" : "Enable & publish"}</button>
            {:else}
              <p>Live at <a href={webDeployUrl(project)} target="_blank" rel="noopener noreferrer">{webDeployUrl(project)}</a></p>
              <label class="toggle-row">
                <input type="checkbox" checked={project.web_auto_publish} onchange={toggleAutoPublish} />
                Automatically re-publish after each deploy
              </label>
              <div class="row-actions">
                <button class="ghost small" onclick={republishWeb} disabled={webBusy}>{webBusy ? "Working…" : "Re-publish latest deploy"}</button>
                <button class="ghost small danger" onclick={disableWeb} disabled={webBusy}>Take offline</button>
              </div>
            {/if}
          </div>
        {/if}
        {#if settingsError}<p class="error">{settingsError}</p>{/if}
        <p class="muted small">Committing, deploying and rollback live in the desktop app.</p>
      </div>
    {:else if tab === "issues"}
      <IssuesPanel projectId={project.id} canWrite={false} canInteract={isMember} onOpenProfile={(id) => navigate(`/user/${id}`)} />
    {:else if tab === "planning" && isMember}
      <PlanningTab
        projectId={project.id}
        teamId={project.team_id}
        {members}
        {issues}
        currentUserId={auth.user?.id ?? null}
        {isMember}
        {isAdmin}
        onOpenFile={() => (tab = "files")}
      />
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

  .tag.live {
    color: var(--ok, #34d399);
    border-color: color-mix(in srgb, var(--ok, #34d399) 45%, transparent);
    text-decoration: none;
    font-weight: 600;
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
    grid-template-columns: repeat(4, 1fr);
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
    text-align: left;
    color: var(--text);
  }

  button.stat:hover {
    border-color: var(--accent);
  }

  .stat-num.sm {
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .dot.success {
    background: var(--ok, #34d399);
  }
  .dot.failed {
    background: var(--danger, #f87171);
  }

  .ov-grid {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 16px;
    align-items: start;
  }

  .ov-side {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .side-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
  }
  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .side-row a {
    color: var(--accent);
  }
  .inline-link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0;
    text-align: left;
    font-size: 13px;
  }
  .activity {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .activity li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .activity .dot {
    margin-top: 5px;
  }
  .act-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
  }
  .field {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field label,
  .field-label {
    font-size: 12px;
    color: var(--text-muted);
  }
  .row-end {
    display: flex;
    justify-content: flex-end;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin: 8px 0;
  }
  .danger {
    color: var(--danger, #f87171);
  }
  .settings code {
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }

  @media (max-width: 720px) {
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
    .ov-grid {
      grid-template-columns: 1fr;
    }
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
