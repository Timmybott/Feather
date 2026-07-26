<script lang="ts">
  import { onMount } from "svelte";
  import ConsoleView from "../../src/lib/components/ConsoleView.svelte";
  import type { LiveState, Server } from "../../src/lib/types";
  import { panelJson } from "../lib/panel";

  let {
    panelId,
    identifier,
    serverName,
    onClose,
  }: {
    panelId: string;
    identifier: string;
    serverName: string;
    onClose: () => void;
  } = $props();

  const BUFFER = 500;

  let lines = $state<string[]>([]);
  let live = $state<LiveState>({ state: null, stats: null, connected: false });

  // ConsoleView only reads `server.name`; a minimal object is enough.
  const server = $derived({ identifier, name: serverName } as unknown as Server);

  let socket: WebSocket | null = null;
  let closed = false;

  function append(line: string) {
    lines = [...lines, line];
    if (lines.length > BUFFER) lines = lines.slice(lines.length - BUFFER);
  }

  /** Fresh Wings websocket credentials from the panel (via the proxy). */
  async function credentials(): Promise<{ token: string; socket: string }> {
    const res = await panelJson<{ data: { token: string; socket: string } }>({
      action: "websocket",
      panel: panelId,
      server: identifier,
    });
    return res.data;
  }

  async function connect() {
    let creds: { token: string; socket: string };
    try {
      creds = await credentials();
    } catch (e) {
      append(`[feather] could not reach the server: ${e instanceof Error ? e.message : e}`);
      return;
    }
    if (closed) return;
    const ws = new WebSocket(creds.socket);
    socket = ws;

    ws.onopen = () => ws.send(JSON.stringify({ event: "auth", args: [creds.token] }));
    ws.onclose = () => {
      live = { ...live, connected: false };
      if (!closed) setTimeout(connect, 3000); // reconnect with backoff
    };
    ws.onerror = () => ws.close();
    ws.onmessage = async (msg) => {
      let payload: { event: string; args?: string[] };
      try {
        payload = JSON.parse(msg.data as string);
      } catch {
        return;
      }
      const arg = payload.args?.[0];
      switch (payload.event) {
        case "auth success":
          live = { ...live, connected: true };
          ws.send(JSON.stringify({ event: "send logs", args: [null] }));
          break;
        case "status":
          if (arg) live = { ...live, state: arg as LiveState["state"] };
          break;
        case "console output":
          if (arg !== undefined) append(arg);
          break;
        case "token expiring":
        case "token expired":
          try {
            const next = await credentials();
            ws.send(JSON.stringify({ event: "auth", args: [next.token] }));
          } catch {
            ws.close();
          }
          break;
      }
    };
  }

  async function send(command: string): Promise<void> {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: "send command", args: [command] }));
    }
  }

  onMount(() => {
    void connect();
    return () => {
      closed = true;
      socket?.close();
    };
  });
</script>

<ConsoleView {server} {live} {lines} onSend={send} {onClose} />
