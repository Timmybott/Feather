<script lang="ts">
  import type { CloudPanel } from "../cloud";

  // Guided "new server" flow. Pterodactyl's client API cannot create servers
  // (that needs the admin Application API), so Feather plans the spec, hands off
  // to the panel/host to actually create it, then flows into the import.
  let {
    panels,
    onImport,
    onClose,
  }: {
    panels: CloudPanel[];
    onImport: () => void;
    onClose: () => void;
  } = $props();

  const RUNTIMES = [
    { id: "website", label: "Website (Nginx / PHP)", egg: "an Nginx / web-hosting egg" },
    { id: "node", label: "Node.js", egg: "a Node.js egg" },
    { id: "python", label: "Python", egg: "a Python egg" },
    { id: "go", label: "Go", egg: "a Go / generic egg" },
    { id: "java", label: "Java / Minecraft", egg: "a Java (Minecraft) egg" },
    { id: "other", label: "Other / game server", egg: "the matching egg" },
  ];

  let name = $state("");
  let runtime = $state("website");
  let ram = $state(1024);
  let disk = $state(5120);
  let cpu = $state(100);
  let location = $state("");
  let copied = $state(false);

  const chosen = $derived(RUNTIMES.find((r) => r.id === runtime) ?? RUNTIMES[0]);

  const spec = $derived(
    [
      `Name:     ${name.trim() || "(unnamed)"}`,
      `Runtime:  ${chosen.label}`,
      `Memory:   ${ram} MiB`,
      `Disk:     ${disk} MiB`,
      `CPU:      ${cpu}%`,
      location.trim() ? `Location: ${location.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  // First panel's dashboard, for a quick jump.
  const panelUrl = $derived(panels[0]?.base_url ?? null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(spec);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard may be unavailable — ignore
    }
  }

  function proceed() {
    onClose();
    onImport();
  }
</script>

<div class="backdrop" role="button" tabindex="-1" onclick={onClose} onkeydown={(e) => e.key === "Escape" && onClose()}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="New server">
  <h2>New server</h2>
  <p class="muted intro">
    Feather can't create servers directly — Pterodactyl's client API doesn't allow it (only your
    host's admin panel can). So plan it here, create it with these specs at your host/panel, then
    <strong>import it</strong> as a project.
  </p>

  <div class="field">
    <label for="ns-name">Name</label>
    <input id="ns-name" bind:value={name} placeholder="My website" autocomplete="off" />
  </div>

  <div class="field">
    <label for="ns-runtime">What runs on it</label>
    <select id="ns-runtime" bind:value={runtime}>
      {#each RUNTIMES as r (r.id)}
        <option value={r.id}>{r.label}</option>
      {/each}
    </select>
  </div>

  <div class="grid3">
    <div class="field">
      <label for="ns-ram">Memory (MiB)</label>
      <input id="ns-ram" type="number" min="128" step="128" bind:value={ram} />
    </div>
    <div class="field">
      <label for="ns-disk">Disk (MiB)</label>
      <input id="ns-disk" type="number" min="256" step="256" bind:value={disk} />
    </div>
    <div class="field">
      <label for="ns-cpu">CPU (%)</label>
      <input id="ns-cpu" type="number" min="10" step="10" bind:value={cpu} />
    </div>
  </div>

  <div class="field">
    <label for="ns-loc">Location / node <span class="muted">(optional)</span></label>
    <input id="ns-loc" bind:value={location} placeholder="e.g. EU · Frankfurt" autocomplete="off" />
  </div>

  <div class="summary">
    <div class="summary-head">
      <span class="muted small">Create a server with these specs (pick {chosen.egg})</span>
      <button class="ghost tiny" onclick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
    <pre>{spec}</pre>
  </div>

  <div class="actions">
    <button class="ghost" onclick={onClose}>Cancel</button>
    {#if panelUrl}
      <a class="ghost btn" href={panelUrl} target="_blank" rel="noopener noreferrer">Open panel ↗</a>
    {/if}
    <button class="primary" onclick={proceed}>I've created it → Import</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 50;
    border: none;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    z-index: 51;
  }
  h2 {
    font-size: 18px;
    margin-bottom: 8px;
  }
  .intro {
    font-size: 13px;
    line-height: 1.55;
    margin-bottom: 16px;
  }
  .field {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field label {
    font-size: 12px;
    color: var(--text-muted);
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .summary {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
    margin: 6px 0 16px;
  }
  .summary-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .summary pre {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    margin: 0;
  }
  .small {
    font-size: 11px;
  }
  .tiny {
    font-size: 11px;
    padding: 3px 9px;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  a.btn {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
</style>
