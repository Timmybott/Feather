// Infer the *kind* of a Pterodactyl server from its Docker image (and, as a
// fallback, its startup invocation). Pterodactyl doesn't expose the egg name
// over the client API, but the Docker image is a reliable signal — the official
// "yolks" images are named by runtime (nodejs_20, python_3.11, …) and game
// eggs use recognizable images (fivem, minecraft, srcds, …).
//
// `webCapable` marks kinds that can serve an arbitrary website — the ones that
// may offer Feather's Web Deployments (a website, a Node/Python/Go/Bun/Deno app,
// static files). Game servers and databases can't.
//
// Shared by the desktop app and the web app so the label is always identical.

export interface ServerKind {
  /** Human label, e.g. "Node.js", "Website", "FiveM (GTA V)". */
  label: string;
  /** Can host an arbitrary website (eligible for Web Deployments). */
  webCapable: boolean;
}

interface Rule {
  test: RegExp;
  label: string;
  webCapable: boolean;
}

// Order matters: first match wins, so put specific things before generic ones.
const RULES: Rule[] = [
  { test: /fivem|cfx|gta/, label: "FiveM (GTA V)", webCapable: false },
  { test: /nginx|apache|httpd|caddy|webhost|static|html/, label: "Website", webCapable: true },
  { test: /\bphp|php[-_]?fpm|php\d/, label: "PHP / Website", webCapable: true },
  { test: /node|nodejs|bun|deno/, label: "Node.js", webCapable: true },
  { test: /python|py3|django|flask/, label: "Python", webCapable: true },
  { test: /golang|\bgo[-_:]/, label: "Go", webCapable: true },
  { test: /dotnet|aspnet|\.net/, label: ".NET", webCapable: true },
  { test: /ruby|rails/, label: "Ruby", webCapable: true },
  { test: /paper|spigot|forge|fabric|purpur|bukkit|minecraft|\bmc[-_]/, label: "Minecraft", webCapable: false },
  { test: /srcds|source|csgo|cs2|gmod|garrysmod|tf2/, label: "Source game", webCapable: false },
  { test: /rust[-_:]|valheim|terraria|ark|arma|squad|unturned|factorio/, label: "Game server", webCapable: false },
  { test: /mariadb|mysql|postgres|mongo|redis|database/, label: "Database", webCapable: false },
  { test: /java(\b|\d|_)/, label: "Java", webCapable: false },
];

/** Classify a server from its Docker image (and optional startup invocation). */
export function serverKind(dockerImage?: string | null, invocation?: string | null): ServerKind {
  const hay = `${dockerImage ?? ""} ${invocation ?? ""}`.toLowerCase();
  if (hay.trim() === "") return { label: "Server", webCapable: false };
  for (const rule of RULES) {
    if (rule.test.test(hay)) return { label: rule.label, webCapable: rule.webCapable };
  }
  return { label: "Server", webCapable: false };
}
