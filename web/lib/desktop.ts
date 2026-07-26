// "Open in desktop app" deep links. The installable Feather app can register
// the `feather://` URL scheme; a link like `feather://project/<id>` then opens
// the app on that page. When no app is registered the browser simply ignores
// it, so this is safe to offer everywhere — a companion button for the people
// who do have the app and want to commit/deploy (which the web can't do).

const DOWNLOAD_URL = "https://github.com/Timmybott/Feather/releases/latest";

export function desktopUrl(path: string): string {
  return `feather://${path.replace(/^\/+/, "")}`;
}

/** Try to hand off to the desktop app for `path` (e.g. `project/<id>`). */
export function openInDesktop(path: string): void {
  // Navigating to the custom scheme hands off to the OS. If nothing handles it
  // the page stays put; the caller pairs this with a visible "get the app" cue.
  window.location.href = desktopUrl(path);
}

export { DOWNLOAD_URL };
