// A tiny hash router. Routes:
//   #/                     home
//   #/search?q=…           search results
//   #/login                sign in / sign up
//   #/u/<userId>           a user's profile
//   #/t/<teamId>           a team's page
//   #/p/<projectId>        a project's page

function current(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export const router = $state({ path: current() });

window.addEventListener("hashchange", () => {
  router.path = current();
  window.scrollTo(0, 0);
});

/** Navigate to a hash path (e.g. `/p/<id>`). */
export function navigate(to: string): void {
  const next = to.startsWith("/") ? to : `/${to}`;
  if (current() === next) router.path = next;
  else window.location.hash = next;
}

export function goHome(): void {
  navigate("/");
}

export function back(): void {
  history.back();
}

/** Parse `router.path` into a page + params. */
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
    case "u":
      return { page: "user", id, query };
    case "t":
      return { page: "team", id, query };
    case "p":
      return { page: "project", id, query };
    default:
      return { page: "home", id: "", query };
  }
}
