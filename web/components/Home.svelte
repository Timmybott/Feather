<script lang="ts">
  import Logo from "../../src/lib/components/Logo.svelte";
  import { navigate } from "../lib/router.svelte";

  let q = $state("");

  function search(event: SubmitEvent) {
    event.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
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
    <a class="btn primary" href="https://github.com/Timmybott/Feather/releases/latest" target="_blank" rel="noopener noreferrer">Get the desktop app</a>
    <button class="btn ghost" onclick={() => navigate("/login")}>Sign in</button>
  </div>
</div>

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

<style>
  .hero {
    text-align: center;
    max-width: 680px;
    margin: 48px auto 40px;
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

  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    max-width: 900px;
    margin: 0 auto;
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

  @media (max-width: 720px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
