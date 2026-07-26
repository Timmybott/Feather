// Client for the `feather-panel` Edge Function — the browser's bridge to a
// team's Pterodactyl panel. The function authorizes the caller (membership) and
// holds the panel key server-side; the browser only ever talks to this.

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "../../src/lib/supabase";

export const PANEL_ENDPOINT = `${SUPABASE_URL}/functions/v1/feather-panel`;

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? SUPABASE_ANON_KEY;
  return { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, ...extra };
}

export async function panelFetch(
  params: Record<string, string>,
  init: RequestInit = {},
): Promise<Response> {
  const qs = new URLSearchParams(params).toString();
  const headers = await authHeaders((init.headers as Record<string, string>) ?? {});
  return fetch(`${PANEL_ENDPOINT}?${qs}`, { ...init, headers });
}

export async function panelJson<T>(
  params: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const res = await panelFetch(params, init);
  if (!res.ok) {
    let msg = `panel proxy returned ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}
