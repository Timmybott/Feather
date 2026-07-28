<script lang="ts">
  import { untrack } from "svelte";
  import { createServerFolder, deleteServerFiles, listServerFiles } from "../api";
  import { formatBytes } from "../format";
  import type { FileEntry } from "../types";
  import FileEditor from "./FileEditor.svelte";

  let {
    panelId,
    identifier,
    canWrite = true,
    openPath = null,
  }: {
    panelId: string;
    identifier: string;
    canWrite?: boolean;
    /** A file path to jump straight to (from a chat #file mention). */
    openPath?: string | null;
  } = $props();

  let segments = $state<string[]>([]);
  let entries = $state<FileEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let newFolderName = $state("");
  let armedDelete = $state<string | null>(null);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let editing = $state<{ path: string; size: number } | null>(null);
  // Filename to auto-open once the target directory's listing loads.
  let pendingOpen = $state<string | null>(null);

  const currentDir = $derived("/" + segments.join("/"));

  function openFile(entry: FileEntry) {
    const dir = currentDir === "/" ? "" : currentDir;
    editing = { path: `${dir}/${entry.name}`, size: entry.size };
  }

  // Jump to a #file mention: split the path into its directory and filename,
  // navigate there, and remember the file to open once the listing arrives.
  function goToPath(path: string) {
    const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts.length === 0) return;
    pendingOpen = parts[parts.length - 1];
    segments = parts.slice(0, -1);
    // If we're already in the target directory, load() won't re-fire on
    // currentDir — open from the entries we already have.
    tryOpenPending();
  }

  function tryOpenPending() {
    if (!pendingOpen) return;
    const hit = entries.find((e) => e.is_file && e.name === pendingOpen);
    if (hit) {
      pendingOpen = null;
      openFile(hit);
    }
  }

  // A new #file mention target: navigate to it. Only depend on openPath —
  // goToPath reads entries, which must not re-trigger this effect.
  $effect(() => {
    const p = openPath;
    if (p) untrack(() => goToPath(p));
  });

  async function load() {
    loading = true;
    error = null;
    armedDelete = null;
    try {
      entries = await listServerFiles(panelId, identifier, currentDir);
      tryOpenPending();
    } catch (e) {
      error = String(e);
      entries = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void currentDir;
    void load();
  });

  function enter(entry: FileEntry) {
    if (!entry.is_file) segments = [...segments, entry.name];
  }

  function jumpTo(index: number) {
    segments = segments.slice(0, index);
  }

  // Deleting server files is destructive — arm first, confirm second.
  function deleteClick(entry: FileEntry) {
    if (armedDelete !== entry.name) {
      armedDelete = entry.name;
      if (armTimer) clearTimeout(armTimer);
      armTimer = setTimeout(() => (armedDelete = null), 4000);
      return;
    }
    if (armTimer) clearTimeout(armTimer);
    armedDelete = null;
    void (async () => {
      try {
        await deleteServerFiles(panelId, identifier, currentDir, [entry.name]);
        await load();
      } catch (e) {
        error = String(e);
      }
    })();
  }

  async function createFolder(event: SubmitEvent) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createServerFolder(panelId, identifier, currentDir, name);
      newFolderName = "";
      await load();
    } catch (e) {
      error = String(e);
    }
  }
</script>

{#if editing}
  <FileEditor
    {panelId}
    {identifier}
    path={editing.path}
    size={editing.size}
    {canWrite}
    onSaved={load}
    onClose={() => (editing = null)}
  />
{:else}
<div class="browser">
  <nav class="crumbs">
    <button class="crumb" onclick={() => jumpTo(0)}>/</button>
    {#each segments as segment, i (i)}
      <button class="crumb" onclick={() => jumpTo(i + 1)}>{segment}/</button>
    {/each}
    <span class="spacer"></span>
    <button class="ghost" onclick={load} title="Refresh">⟳</button>
  </nav>

  {#if error}<p class="error pad">{error}</p>{/if}

  <div class="listing">
    {#if loading}
      <p class="muted pad">Loading…</p>
    {:else if entries.length === 0}
      <p class="muted pad">Empty directory.</p>
    {:else}
      {#each entries as entry (entry.name)}
        <div class="row">
          <button
            class="entry"
            class:dir={!entry.is_file}
            onclick={() => (entry.is_file ? openFile(entry) : enter(entry))}
            title={entry.is_file ? "Open & edit" : "Open folder"}
          >
            <span class="icon">{entry.is_file ? "▤" : "▸"}</span>
            <span class="name">{entry.name}</span>
            {#if entry.is_file}
              <span class="muted size">{formatBytes(entry.size)}</span>
            {/if}
          </button>
          {#if canWrite}
            <button
              class="delete"
              class:armed={armedDelete === entry.name}
              onclick={() => deleteClick(entry)}
              title="Delete {entry.is_file ? 'file' : 'folder and contents'}"
            >
              {armedDelete === entry.name ? "Sure?" : "✕"}
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  {#if canWrite}
    <form class="new-folder" onsubmit={createFolder}>
      <input
        bind:value={newFolderName}
        placeholder="New folder name…"
        spellcheck="false"
        autocomplete="off"
      />
      <button type="submit" disabled={newFolderName.trim() === ""}>Create</button>
    </form>
  {/if}
</div>
{/if}

<style>
  .browser {
    display: flex;
    flex-direction: column;
    max-height: 60vh;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
  }

  .pad {
    padding: 12px 16px;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 12px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }

  .crumb {
    background: transparent;
    border: none;
    color: var(--accent);
    padding: 2px 4px;
    font-family: ui-monospace, monospace;
    font-size: 12.5px;
  }

  .crumb:hover {
    text-decoration: underline;
  }

  .spacer {
    flex: 1;
  }

  .listing {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
    min-height: 120px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
  }

  .entry {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 7px 6px;
    text-align: left;
    border-radius: 6px;
    min-width: 0;
  }

  .entry:hover {
    background: var(--surface-2);
  }

  .icon {
    color: var(--text-muted);
    width: 16px;
  }

  .entry.dir .icon {
    color: var(--accent);
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .size {
    font-size: 12px;
    white-space: nowrap;
  }

  .delete {
    padding: 4px 8px;
    font-size: 12px;
    color: var(--text-muted);
    background: transparent;
    border-color: transparent;
  }

  .delete:hover:not(:disabled) {
    color: var(--danger);
    border-color: var(--border);
  }

  .delete.armed {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
  }

  .new-folder {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background: var(--surface-2);
    border-top: 1px solid var(--border);
  }
</style>
