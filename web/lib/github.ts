// Live data for the homepage, read from the public GitHub API so the site is
// always up to date without a rebuild: repo stats, contributors, and the
// release feed (which doubles as the changelog and the download source).
//
// api.github.com sends `Access-Control-Allow-Origin: *`, so these fetches work
// straight from the browser. Unauthenticated calls are rate-limited (60/h per
// IP); every helper degrades to null/[] on any error, so a throttled or offline
// visitor still gets a working page — the sections just hide themselves.

const REPO = "Timmybott/Feather";
const API = `https://api.github.com/repos/${REPO}`;

export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

export interface RepoStats {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  htmlUrl: string;
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  name: string;
  tag: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
}

export interface Contributor {
  login: string;
  avatarUrl: string;
  htmlUrl: string;
  contributions: number;
}

// Small in-memory cache so switching views doesn't re-hit the rate limit.
const cache = new Map<string, unknown>();

async function get<T>(url: string): Promise<T | null> {
  if (cache.has(url)) return cache.get(url) as T;
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    cache.set(url, data);
    return data;
  } catch {
    return null;
  }
}

export async function repoStats(): Promise<RepoStats | null> {
  const r = await get<{
    stargazers_count: number;
    forks_count: number;
    open_issues_count: number;
    subscribers_count: number;
    html_url: string;
  }>(API);
  if (!r) return null;
  return {
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    watchers: r.subscribers_count,
    htmlUrl: r.html_url,
  };
}

interface RawRelease {
  name: string | null;
  tag_name: string;
  body: string | null;
  published_at: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

function shape(r: RawRelease): Release {
  return {
    name: r.name || r.tag_name,
    tag: r.tag_name,
    body: r.body ?? "",
    publishedAt: r.published_at,
    htmlUrl: r.html_url,
    assets: (r.assets ?? []).map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    })),
  };
}

/** The most recent published releases (newest first), skipping drafts. */
export async function releases(limit = 5): Promise<Release[]> {
  const raw = await get<RawRelease[]>(`${API}/releases?per_page=${limit}`);
  if (!raw) return [];
  return raw.filter((r) => !r.draft).map(shape);
}

export async function latestRelease(): Promise<Release | null> {
  const raw = await get<RawRelease>(`${API}/releases/latest`);
  return raw ? shape(raw) : null;
}

export async function contributors(limit = 24): Promise<Contributor[]> {
  const raw = await get<
    { login: string; avatar_url: string; html_url: string; contributions: number }[]
  >(`${API}/contributors?per_page=${limit}`);
  if (!raw) return [];
  return raw
    .filter((c) => c.login && !c.login.endsWith("[bot]"))
    .map((c) => ({
      login: c.login,
      avatarUrl: c.avatar_url,
      htmlUrl: c.html_url,
      contributions: c.contributions,
    }));
}

export type OS = "windows" | "mac" | "linux" | "unknown";

/** Best guess at the visitor's OS, for the "Get the desktop app" button. */
export function detectOS(): OS {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = (nav.userAgentData?.platform || navigator.platform || "").toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (hint.includes("win") || ua.includes("windows")) return "windows";
  if (hint.includes("mac") || ua.includes("mac os")) return "mac";
  if (hint.includes("linux") || ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

export const OS_LABELS: Record<OS, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
  unknown: "your device",
};

/**
 * The download URL + filename for `os` from a release's assets, or null when the
 * platform has no matching installer (the caller falls back to the releases
 * page). Windows → the NSIS `-setup.exe`; Linux → `.AppImage` (universal),
 * else `.deb`; macOS → `.dmg`, else `.app.tar.gz`.
 */
export function pickAsset(rel: Release, os: OS): ReleaseAsset | null {
  const by = (test: (n: string) => boolean) => rel.assets.find((a) => test(a.name.toLowerCase()));
  switch (os) {
    case "windows":
      return by((n) => n.endsWith("-setup.exe")) ?? by((n) => n.endsWith(".exe")) ?? null;
    case "linux":
      return by((n) => n.endsWith(".appimage")) ?? by((n) => n.endsWith(".deb")) ?? null;
    case "mac":
      return by((n) => n.endsWith(".dmg")) ?? by((n) => n.endsWith(".app.tar.gz")) ?? null;
    default:
      return null;
  }
}
