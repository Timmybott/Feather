// A tiny history (pushState) router — clean, hash-free URLs:
//   /                       home
//   /search?q=…             search results
//   /login                  sign in / sign up
//   /settings               account settings
//   /user/<username|id>     a user's profile
//   /team/<slug|id>         a team's page
//   /project/<slug|id>      a project's page
//
// Requires the web server to fall back to index.html for unknown paths (nginx:
// `try_files $uri $uri/ /index.html;`) so deep links and refreshes load the SPA.
// Real files/dirs (e.g. /webdeployment/<slug>/) are served before the fallback.

// One-time migration of legacy hash URLs (#/t/x → /team/x) that people may have
// bookmarked or shared, so old links keep working.
if (window.location.hash.startsWith("#/")) {
  const legacy = window.location.hash.slice(1);
  const mapped = legacy
    .replace(/^\/t\//, "/team/")
    .replace(/^\/u\//, "/user/")
    .replace(/^\/p\//, "/project/");
  history.replaceState({}, "", mapped || "/");
}

function current(): string {
  return window.location.pathname + window.location.search || "/";
}

export const router = $state({ path: current() });

window.addEventListener("popstate", () => {
  router.path = current();
  window.scrollTo(0, 0);
});

/** Navigate to a clean path (e.g. `/project/<slug>`). */
export function navigate(to: string): void {
  const next = to.startsWith("/") ? to : `/${to}`;
  if (current() !== next) {
    history.pushState({}, "", next);
    router.path = next;
    window.scrollTo(0, 0);
  }
}

export function goHome(): void {
  navigate("/");
}

export function back(): void {
  history.back();
}

/** Parse `router.path` into a page + params. Old /t /u /p prefixes still work. */
export function parse(path: string): { page: string; id: string; query: URLSearchParams } {
  const [raw, qs = ""] = path.split("?");
  const parts = raw.split("/").filter(Boolean);
  const query = new URLSearchParams(qs);
  if (parts.length === 0) return { page: "home", id: "", query };
  const [head, id = ""] = parts;
  switch (head) {
    case "search":
      return { page: "search", id: "", query };
    case "login":
      return { page: "login", id: "", query };
    case "settings":
      return { page: "settings", id: "", query };
    case "user":
    case "u":
      return { page: "user", id: decodeURIComponent(id), query };
    case "team":
    case "t":
      return { page: "team", id: decodeURIComponent(id), query };
    case "project":
    case "p":
      return { page: "project", id: decodeURIComponent(id), query };
    default:
      return { page: "home", id: "", query };
  }
}
