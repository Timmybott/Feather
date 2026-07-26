<script lang="ts">
  import { onMount } from "svelte";
  import Logo from "../../src/lib/components/Logo.svelte";
  import Markdown from "../../src/lib/components/Markdown.svelte";
  import {
    contributors,
    detectOS,
    latestRelease,
    LATEST_RELEASE_URL,
    OS_LABELS,
    pickAsset,
    releases,
    RELEASES_URL,
    repoStats,
    REPO_URL,
    type Contributor,
    type Release,
    type RepoStats,
  } from "../lib/github";
  import { navigate } from "../lib/router.svelte";

  let q = $state("");
  const os = detectOS();

  let latest = $state<Release | null>(null);
  let recent = $state<Release[]>([]);
  let people = $state<Contributor[]>([]);
  let stats = $state<RepoStats | null>(null);
  let expanded = $state<string | null>(null);

  onMount(async () => {
    const [l, r, c, s] = await Promise.all([
      latestRelease(),
      releases(6),
      contributors(24),
      repoStats(),
    ]);
    latest = l;
    recent = r;
    people = c;
    stats = s;
    // Show the newest release's notes open by default.
    expanded = (l ?? r[0])?.tag ?? null;
  });

  // OS-aware download: link straight to the matching installer when we can,
  // else the latest-release page.
  const download = $derived.by(() => {
    if (latest) {
      const asset = pickAsset(latest, os);
      if (asset) return { url: asset.url, label: `Download for ${OS_LABELS[os]}` };
      return { url: latest.htmlUrl, label: "Get the desktop app" };
    }
    return { url: LATEST_RELEASE_URL, label: "Get the desktop app" };
  });

  function search(event: SubmitEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  function compact(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
  }

  function when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="hero">
  <div class="logo-xl"><Logo size={72} /></div>
  <h1>Feather</h1>
  <p class="tagline">
    A cloud-backed, team-collaborative home for your
    <a href="https://pterodactyl.io" target="_blank" rel="noopener noreferrer">Pterodactyl</a>
    game servers — projects, issues, deploy history and files, shared by your whole team.
  </p>

  <form class="hero-search" onsubmit={search}>
    <input bind:value={q} placeholder="Search teams, users and projects…" spellcheck="false" autocomplete="off" />
    <button class="primary" type="submit">Search</button>
  </form>

  <div class="cta">
    <a class="btn primary" href={download.url} target="_blank" rel="noopener noreferrer">{download.label}</a>
    <button class="btn ghost" onclick={() => navigate("/login")}>Sign in</button>
  </div>
  {#if latest}
    <p class="ver">
      Latest release
      <a href={latest.htmlUrl} target="_blank" rel="noopener noreferrer">{latest.tag}</a>
      · {when(latest.publishedAt)}
    </p>
  {/if}
</div>

{#if stats}
  <section class="stats-row">
    <a class="stat" href={stats.htmlUrl} target="_blank" rel="noopener noreferrer">
      <span class="num">{compact(stats.stars)}</span><span class="lbl">Stars</span>
    </a>
    <a class="stat" href="{REPO_URL}/forks" target="_blank" rel="noopener noreferrer">
      <span class="num">{compact(stats.forks)}</span><span class="lbl">Forks</span>
    </a>
    <a class="stat" href="{REPO_URL}/graphs/contributors" target="_blank" rel="noopener noreferrer">
      <span class="num">{compact(people.length)}{people.length >= 24 ? "+" : ""}</span><span class="lbl">Contributors</span>
    </a>
    {#if latest}
      <a class="stat" href={latest.htmlUrl} target="_blank" rel="noopener noreferrer">
        <span class="num">{latest.tag}</span><span class="lbl">Version</span>
      </a>
    {/if}
  </section>
{/if}

<section class="cards">
  <div class="feature">
    <h3>Browse &amp; search</h3>
    <p>Find any team, person or project and open its page — READMEs, members, issues and deploy history, all public.</p>
  </div>
  <div class="feature">
    <h3>Look, on the web</h3>
    <p>View a project's files, read its history and diffs, and follow issues right in the browser — the same look as the app.</p>
  </div>
  <div class="feature">
    <h3>Do, on the desktop</h3>
    <p>Committing, deploying and rollbacks live in the installable app. The web is for reading and reporting; the desktop is for shipping.</p>
  </div>
</section>

{#if recent.length > 0}
  <section class="block">
    <div class="block-head">
      <h2>What's new</h2>
      <a class="more" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">All releases ↗</a>
    </div>
    <div class="changelog">
      {#each recent as rel (rel.tag)}
        <article class="rel">
          <button class="rel-head" onclick={() => (expanded = expanded === rel.tag ? null : rel.tag)}>
            <span class="rel-title">
              <span class="rel-tag">{rel.tag}</span>
              {#if rel.name && rel.name !== rel.tag}<span class="rel-name">{rel.name}</span>{/if}
            </span>
            <span class="rel-meta">{when(rel.publishedAt)} <span class="chev">{expanded === rel.tag ? "▾" : "▸"}</span></span>
          </button>
          {#if expanded === rel.tag}
            <div class="rel-body">
              {#if rel.body.trim()}
                <Markdown source={rel.body} />
              {:else}
                <p class="muted">No release notes.</p>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}

{#if people.length > 0}
  <section class="block">
    <div class="block-head">
      <h2>Contributors</h2>
      <a class="more" href="{REPO_URL}/graphs/contributors" target="_blank" rel="noopener noreferrer">On GitHub ↗</a>
    </div>
    <div class="people">
      {#each people as c (c.login)}
        <a class="person" href={c.htmlUrl} target="_blank" rel="noopener noreferrer" title="{c.login} · {c.contributions} commits">
          <img src={c.avatarUrl} alt={c.login} loading="lazy" />
          <span class="handle">{c.login}</span>
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .hero {
    text-align: center;
    max-width: 680px;
    margin: 48px auto 34px;
  }

  .logo-xl {
    display: inline-flex;
    margin-bottom: 14px;
  }

  h1 {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .tagline {
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1.6;
    margin-bottom: 26px;
  }

  .tagline a {
    color: var(--accent);
  }

  .hero-search {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }

  .hero-search input {
    flex: 1;
    padding: 11px 14px;
    font-size: 15px;
  }

  .cta {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 9px 16px;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    font-size: 14px;
  }

  a.btn.primary {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: #fff;
  }

  a.btn.primary:hover {
    background: var(--accent-hover);
  }

  .ver {
    margin-top: 12px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .ver a {
    color: var(--accent);
    font-family: ui-monospace, monospace;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    max-width: 640px;
    margin: 0 auto 40px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px 10px;
    text-decoration: none;
    color: var(--text);
  }

  .stat:hover {
    border-color: var(--accent);
  }

  .stat .num {
    font-size: 20px;
    font-weight: 700;
  }

  .stat .lbl {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    max-width: 900px;
    margin: 0 auto 44px;
  }

  .feature {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }

  .feature h3 {
    font-size: 15px;
    margin-bottom: 8px;
  }

  .feature p {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.55;
  }

  .block {
    max-width: 900px;
    margin: 0 auto 44px;
  }

  .block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .block-head h2 {
    font-size: 18px;
  }

  .more {
    font-size: 12px;
    color: var(--accent);
    text-decoration: none;
  }

  .changelog {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .rel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .rel-head {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 14px 16px;
    text-align: left;
  }

  .rel-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .rel-tag {
    font-family: ui-monospace, monospace;
    font-weight: 700;
    font-size: 14px;
  }

  .rel-name {
    color: var(--text-muted);
    font-size: 13px;
  }

  .rel-meta {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
  }

  .chev {
    margin-left: 6px;
  }

  .rel-body {
    padding: 0 16px 16px;
    border-top: 1px solid var(--border);
    font-size: 14px;
  }

  .people {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 12px;
  }

  .person {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: var(--text-muted);
  }

  .person img {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid var(--border);
    object-fit: cover;
  }

  .person:hover {
    color: var(--accent);
  }

  .person:hover img {
    border-color: var(--accent);
  }

  .handle {
    font-size: 11px;
    max-width: 82px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .cards {
      grid-template-columns: 1fr;
    }
    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
