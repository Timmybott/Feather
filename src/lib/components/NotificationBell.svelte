<script lang="ts">
  import { onMount } from "svelte";
  import { auth } from "../auth.svelte";
  import {
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    subscribeNotifications,
    unreadNotificationCount,
    type Notification,
  } from "../planning";

  // Opens the project a notification points at (link = project id).
  let { onOpen }: { onOpen?: (projectId: string) => void } = $props();

  let open = $state(false);
  let items = $state<Notification[]>([]);
  let unread = $state(0);

  async function refresh() {
    try {
      [items, unread] = await Promise.all([listNotifications(), unreadNotificationCount()]);
    } catch {
      // stay quiet — the bell is non-critical
    }
  }

  onMount(() => {
    const id = auth.user?.id;
    if (!id) return;
    void refresh();
    const unsub = subscribeNotifications(id, () => void refresh());
    return unsub;
  });

  function when(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  async function openItem(n: Notification) {
    open = false;
    if (!n.read) {
      void markNotificationRead(n.id);
      items = items.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      unread = Math.max(0, unread - 1);
    }
    if (n.link && onOpen) onOpen(n.link);
  }

  async function markAll() {
    await markAllNotificationsRead();
    items = items.map((x) => ({ ...x, read: true }));
    unread = 0;
  }

  function onWindowClick(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest(".notif")) open = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="notif">
  <button class="bell" onclick={() => { open = !open; if (open) void refresh(); }} title="Notifications" aria-label="Notifications">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    {#if unread > 0}<span class="dot">{unread > 9 ? "9+" : unread}</span>{/if}
  </button>

  {#if open}
    <div class="menu" role="menu">
      <div class="head">
        <span>Notifications</span>
        {#if unread > 0}<button class="link" onclick={markAll}>Mark all read</button>{/if}
      </div>
      {#if items.length === 0}
        <p class="empty muted">No notifications.</p>
      {:else}
        {#each items as n (n.id)}
          <button class="item" class:unread={!n.read} role="menuitem" onclick={() => openItem(n)}>
            <span class="body">{n.body}</span>
            <span class="time muted">{when(n.created_at)}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .notif {
    position: relative;
  }
  .bell {
    position: relative;
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 6px;
    border-radius: 8px;
    line-height: 0;
  }
  .bell:hover {
    color: var(--text);
    background: var(--surface-2);
  }
  .dot {
    position: absolute;
    top: 0;
    right: 0;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--danger, #f87171);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 300px;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    padding: 6px;
    z-index: 40;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 700;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
  }
  .empty {
    padding: 16px 10px;
    font-size: 13px;
    text-align: center;
  }
  .item {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 8px;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .item:hover {
    background: var(--surface-2);
  }
  .item.unread {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .body {
    font-size: 13px;
    line-height: 1.4;
  }
  .time {
    font-size: 11px;
  }
</style>
