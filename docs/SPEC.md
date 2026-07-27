# Projektspezifikation: Feather — Desktop-Client für Pterodactyl

> Stand: 26. Juli 2026 · Version 0.5 (Abschnitt 10 = Cloud- & Team-Kollaboration v2.1; Abschnitt 10.6 = Panels/Projects-Rework v2.2; Abschnitt 10.7 = Cloud-Commits, Profile & Issue-Verknüpfung v2.3; Abschnitt 10.8 = Projekt-Experience: Diffs, Interaktivität & Aufräumen v2.4; Abschnitt 10.9 = Delta-Commits, Bündel-Deploy, Auto-Sync & Deploy-Rollback v2.5; Abschnitt 10.10 = Workflow & Politur: Commit-Details, Vollbild-Views, Navigations-Stack, Bild-Upload, Statistiken v2.6; **Abschnitt 11 = Feather im Web: Webapp, Homepage, Suche & Panel-Proxy v3.0–v3.2**; die Abschnitte 1–9 beschreiben den lokalen v1-Kern)

---

## 1. Vision & Motivation

Eine Desktop-App für **Linux und Windows**, die für Pterodactyl das ist, was GitHub Desktop für Git/GitHub ist: Man wählt lokal einen Projektordner, hält Versionsstände als Commits fest und deployed sie per Klick auf den eigenen Pterodactyl-Server — und verwaltet die Server nebenbei gleich mit (Start/Stop, Status, Konsole).

**Marktumfeld:** Für Pterodactyl existieren Mobile-Apps, Web-Erweiterungen und mit `MythicalLTD/Pterodactyl-Desktop` auch eine Desktop-App auf Client-API-Basis — aber **kein Client mit Deploy-/Versionierungs-Workflow**. Das ist das Alleinstellungsmerkmal von Feather.

**Persönliches Ziel des Projekts:** Ein eigenes Produkt betreiben, das andere Leute aktiv nutzen, auf das sie sich verlassen, zu dem Feedback kommt (GitHub Issues) und auf dessen Updates sich Nutzer freuen (Releases + Auto-Updater).

**Zielgruppe:** Pterodactyl-Nutzer — Betreiber von Game-Servern, Discord-Bots und kleinen Diensten, die regelmäßig Dateien/Code auf ihre Server bringen.

---

## 2. Grundsatzentscheidungen (final)

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Name | **Feather** | Anspielung auf den Pterodactyl-Daemon „Wings"; „verlässlicher Helfer". GitHub-Check 07/2026: im Pterodactyl-Umfeld unbelegt |
| Framework | **Tauri 2** (Rust-Kern, Webview-Frontend) | Kleine Binaries, sauber auf Windows + Linux, Rust ideal für Git/Zip/Upload |
| Frontend | **Svelte 5** + TypeScript + Vite | Kleine Bundles, wenig Boilerplate, eingebaute Reaktivität für Live-Daten |
| Lizenz | **MIT** | Maximal einfache Adoption, üblich im Ökosystem |
| Git-Anbindung | **git2 (gebündeltes libgit2)** | Keine Abhängigkeit vom System-Git des Nutzers |
| Design | **Dark Dev-Look** (VS-Code-artig), Akzent Violett | Zielgruppe sind Entwickler/Selfhoster |
| Panels | **Erstmal ein Panel**, intern als Liste | Multi-Panel später nur UI-Update, keine Migration |
| Versionierung | **Echtes Git unter der Haube** | Rollback trivial, Diffs gratis, Power-User können parallel mit Git arbeiten |
| Upload-Weg | **Pterodactyl File-API** | Signierte Upload-URL + Entpacken über die Client-API |
| Upload-Umfang | **Immer alles** + `.deployignore` + **Manifest-Löschung** | Sicher & simpel; gelöschte Dateien werden gezielt nachgezogen (s. 6.3) |
| Deploy-Ziel | **Pro Projekt wählbar** | Standard Server-Root, optional Unterordner |
| Build-Schritt | **Optional pro Projekt** | Textfeld „Befehl vor Deploy", standardmäßig aus |
| Nach dem Deploy | **Pro Projekt einstellbar** | Neustart oder nur Benachrichtigung |
| Credentials | **System-Schlüsselbund**, Datei-Fallback | Windows Credential Manager / Secret Service; ohne Schlüsselbund verschleierte Fallback-Datei (s. README) |
| Teststrategie | **Mock-Panel im Repo** | Client-API-Subset als eigenes Crate; Kern + CI voll automatisch testbar |
| Lizenz/Modell | **Komplett Open Source** (GitHub) | Issues, Community, Stars als Motivation |
| Updates | **Eingebauter Auto-Updater** | Tauri-Updater + GitHub Releases (ab M5, braucht Signatur-Schlüsselpaar) |

---

## 3. Kern-Features (nach Priorität)

1. **Deploy-System** — Projektordner per Klick auf den Server bringen (Herzstück)
2. **Commit-Historie & Rollback** — Versionsstände festhalten, alte Version per Klick wieder deployen
3. **Server-Verwaltung** — Power-Aktionen (Start/Stop/Restart/Kill), Status auf einen Blick
4. **Live-Konsole** — Konsolen-Output streamen, Befehle senden

## 4. Zusatzfeatures für Version 1 (Bau-Reihenfolge nach Aufwand)

1. **CPU/RAM live auf den Kacheln** — über denselben Websocket wie die Konsole
2. **Desktop-Benachrichtigungen** — Tauri bringt das mit
3. **Auto-Backup vor jedem Deploy** — Backup-API, mit Rotation (s. 6.3)
4. **Datei-Browser für den Server** — teuerstes Feature, als letztes

Dazu: **`.deployignore`** (gitignore-Syntax) — bei „immer alles hochladen" praktisch Pflicht.

---

## 5. UI-Konzept

- **Hauptlayout:** Dashboard mit **Server-Kacheln** (Muster aus dem Panel bekannt)
- **Pro Kachel:** Servername, Status-Punkt (online/startet/offline), CPU- und RAM-Balken live, Deploy-Button als zentrales Element, Power-Button, Icons für Konsole/Historie/Dateien
- **Kopfleiste:** App-Name, Verbindungsstatus zum Panel, Einstellungen
- **Fußleiste:** Git-Status des aktiven Projekts (z. B. „3 Commits seit letztem Deploy"), Benachrichtigungs-Status
- **Deploy-Zustand:** Fortschritt direkt auf der Kachel („Backup erstellt · Upload 68 %")
- **Farbwelt:** Dunkles Theme, Akzent Violett (#8b5cf6), Statusfarben Grün/Orange/Rot

---

## 6. Technische Architektur

### 6.1 Repository-Struktur

```
crates/feather-core/   Panel-API-Client (reqwest), Deploy-Engine, git2, Zip,
                       .deployignore, Datenmodell — KEINE Tauri-Abhängigkeit
crates/mock-panel/     Mock der Pterodactyl Client-API (axum) für Tests + Dev
src-tauri/             Tauri-2-Shell: Fenster, IPC-Commands, Schlüsselbund
src/                   Svelte-5-Frontend
```

Der strikte Kern/Shell-Split hält die gesamte Logik ohne GUI testbar
(`cargo test` gegen das Mock-Panel, auch in CI und Cloud-Umgebungen).

### 6.2 Pterodactyl Client-API (`/api/client`)

Alles Nötige ist mit einem Client-API-Key verfügbar: Serverliste, Power-Aktionen,
Websocket (Konsole + Live-Ressourcen + Backup-Events), Datei-Verwaltung
(auflisten, signierte Upload-URL, entpacken, löschen), Backups. Reserve-Option
für sehr große Projekte: die API liefert SFTP-Zugangsdaten pro Server (nicht v1).

**Websocket-Details (M2):** Das Konsolen-Token läuft nach ~10–15 Minuten ab und
muss per API erneuert werden; Reconnect mit Backoff; ein Socket pro Server.

### 6.3 Deploy-Flow (v2)

```
1. Git-Commit des Projektordners (App legt beim Einrichten ein Repo an, falls keins existiert)
2. Optional: Build-Befehl ausführen (Shell im Projektordner, Output live in der UI,
   Abbruch bei Exit-Code ≠ 0)
3. Auto-Backup anstoßen UND auf Abschluss warten (Backup-API ist asynchron;
   die App pollt den Backup-Status, bis `completed_at` gesetzt ist — robuster
   als das Websocket-Event, weil der Deploy keinen offenen Socket braucht).
   Eigene Backups heißen "feather-pre-deploy-<zeitstempel>" und werden rotiert:
   ist das Backup-Limit des Servers erreicht, wird das älteste eigene gelöscht;
   bei Limit 0 wird der Schritt mit Hinweis übersprungen. Pro Projekt abschaltbar.
4. Zip packen — Ausschlüsse laut .deployignore (gitignore-Syntax, ignore-Crate);
   .git/ und .deployignore selbst sind immer ausgeschlossen
5. Upload über signierte URL; Größenlimits des Panels/Proxys (oft 100 MB) werden
   als klare Fehlermeldung gemeldet
6. Entpacken in Server-Root oder konfigurierten Unterordner;
   danach das hochgeladene Zip per Delete-API vom Server entfernen
7. Manifest-Löschung: Dateien, die im Manifest des letzten Deploys standen und im
   aktuellen fehlen, werden per Delete-API entfernt (Serverdaten außerhalb des
   Projekts — Welten, Datenbanken — bleiben unangetastet)
8. Je nach Projekt-Einstellung: Server neustarten oder Desktop-Benachrichtigung
```

Jeder Schritt meldet Fortschritt als Event an die UI (Kachel-Visualisierung).
Schlägt ein Schritt fehl, wird klar benannt, welcher — das Backup aus Schritt 3
ist der Rettungsanker.

### 6.4 Rollback-Flow

```
1. Nutzer wählt alten Commit aus der Historie
2. `git archive` des Commits in einen Temp-Ordner
   (KEIN Checkout im Projektordner — uncommittete Änderungen bleiben unberührt)
3. Normaler Deploy-Flow ab Schritt 2, Quelle ist der Temp-Ordner
```

### 6.5 Datenmodell (App-Config-Verzeichnis, JSON)

- `panels.json`: Liste (v1: ein Eintrag) `{id, name, base_url}` —
  der API-Key liegt **nur** im System-Schlüsselbund (Service `feather`, Key = Panel-id)
- `projects.json`: `{id, name, local_path, panel_id, server_uuid, target_dir,
  build_command?, post_deploy: "restart"|"notify", auto_backup}`
- Pro Projekt: Deploy-Historie mit `{commit_hash, timestamp}` des letzten Deploys
  und dem Datei-**Manifest** — speist Manifest-Löschung und die Fußleiste
  („N Commits seit letztem Deploy" = `git rev-list <letzter-deploy>..HEAD`)

---

## 7. Meilenstein-Plan

**Prinzip:** Früh etwas Lauffähiges haben.

- **M1 — Verbindung & Dashboard** ✅: Panel-URL + API-Key (Schlüsselbund), Serverliste, Kacheln mit Status, CPU/RAM
- **M2 — Server fühlt sich echt an** ✅: Power-Buttons (Kill zweistufig), Websocket → Live-Konsole mit Befehlseingabe + CPU/RAM live, Token-Refresh/Reconnect mit Backoff
- **M3 — Deploy-Kern** ✅: Projektordner verknüpfen (Ordner-Picker), Zip → Upload → Entpacken → Zip-Cleanup, `.deployignore`, Manifest-Löschung, Zielordner, Verhalten nach Deploy, Desktop-Benachrichtigungen, Fortschritt auf der Kachel
- **M4 — Versionierung** ✅: git2-Integration (Repo-Init beim Verknüpfen, Auto-Commit vor Deploy), Commit-UI + Historie mit „deployed"-Marker, Rollback (Tree-Archive in Tempdir, Working Tree unberührt), Auto-Backup mit Rotation (nur eigene `feather-pre-deploy-*`), optionaler Build-Befehl mit Live-Output, Fußleiste „N Commits seit letztem Deploy"
- **M5 — Komfort & Release** ✅: Datei-Browser (navigieren, Ordner anlegen, löschen), Auto-Updater (GitHub Releases + latest.json; Signatur-Schlüsselpaar wird vom Betreiber erzeugt, siehe docs/RELEASING.md), Release-Workflow für Windows (NSIS) + Linux (AppImage, .deb), Ein-Zeilen-Installer für Linux (install.sh)

---

## 8. Open Source & Community

- GitHub-Repo öffentlich, Feedback über Issues + Discussions
- Releases über GitHub Releases, ausgeliefert per Auto-Updater
- Changelog pro Release — „Vorfreude auf Updates" ist erklärtes Projektziel
- Launch-Kanäle: Pterodactyl-Discord, r/selfhosted, r/admincraft
- Sprache von UI, Code und README: **Englisch** (internationale Zielgruppe); diese Spezifikation bleibt Deutsch

## 9. Offene Punkte

- [ ] Logo/Icon entwerfen (aktuell Platzhalter: violettes „W")
- [ ] Erstes Release veröffentlichen: Updater-Schlüsselpaar erzeugen, Secrets setzen, Tag pushen (docs/RELEASING.md), dann Launch in den Community-Kanälen (Abschnitt 8)
- [x] M5 (Datei-Browser, Auto-Updater, Release-Pipeline, Installer) — 19.07.2026
- [x] M4 (Versionierung) — 19.07.2026
- [x] M3 (Deploy-Kern) — 19.07.2026
- [x] M2 (Websocket, Power-Aktionen, Konsole) — 19.07.2026
- [x] Name final festlegen (Feather, Verfügbarkeit geprüft 07/2026)
- [x] Frontend-Framework wählen (Svelte 5)
- [x] Open-Source-Lizenz wählen (MIT)
- [x] Repo aufsetzen + M1 (19.07.2026)

---

## 10. Cloud & Team-Kollaboration (v2.1)

Ab v2.1 wird Feather vom lokalen Einzelplatz-Tool zur **team-fähigen, cloud-gestützten Plattform** — GitHub-artig: Konto, Team, Projekte mit Detailseite, Issues, Deploy-Historie und Planung, alles geteilt. Die **Deploy-Engine bleibt lokal** (sie braucht Dateien, Git und direkten Panel-Zugriff); die Cloud hält nur die geteilten Metadaten.

### 10.1 Grundsatzentscheidungen (v2.1)

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Oberfläche | **Nur Desktop-App** (kein Web-App) | Feather bleibt die bestehende Tauri-App; jeder im Team installiert sie |
| Datenbank | **Supabase** (kostenlos) | Postgres + eingebaute Auth + Row-Level Security + Realtime, passt aufs relationale Modell |
| Panel-Keys | **Geteilt, in der DB verschlüsselt** | Master-Key in Supabase Vault (`pgcrypto`), Entschlüsselung nur für Team-Mitglieder; auf dem Gerät nur im RAM |
| Credentials (ersetzt Abschnitt 2) | **Cloud-verschlüsselt statt System-Schlüsselbund** | Der lokale Keyring/Datei-Fallback aus v1 entfällt; Keys leben verschlüsselt in der Cloud |
| Sicherheit | **RLS auf allen Tabellen + `SECURITY DEFINER`-Funktionen** | Sensible Aktionen prüfen Mitgliedschaft und stempeln den Nutzer serverseitig |

### 10.2 Kollaborationsmodell

- **Konto** (E-Mail-Login) → **Team** (Einheit der Zusammenarbeit) → geteilte Panels, Projekte, Historie, Issues.
- **Mitglieder** per E-Mail einladen (Rollen owner/admin/member); der Owner ist geschützt.
- **RLS** stellt sicher, dass man nur Daten der eigenen Teams sieht.

### 10.3 Cloud-Datenmodell (Supabase, `supabase/0001`–`0006`)

- `profiles` (1:1 zu Auth-User), `teams`, `team_members` (Rollen)
- `panels` (Pterodactyl-Verbindungen, `api_key_encrypted` als bytea)
- `projects` (Name, Beschreibung, optional Panel/Server, Deploy-Optionen)
- `deploys` (Historie: kind, status, commit, files, Nutzer, Zeit)
- `issues` + `issue_comments` (pro Projekt nummeriert, open/closed)
- Funktionen: `create_team`, `create_panel`/`panel_api_key`, `invite_member`/`remove_member`, `record_deploy`, `create_issue`/`add_issue_comment` — alle `SECURITY DEFINER` mit Mitgliedschaftsprüfung.

### 10.4 Meilensteine (v2.1)

- **M6 — Konten & Teams** ✅: E-Mail-Login, Team anlegen/wählen, App-Gate (Auth → Team → App)
- **M7 — Geteilte, verschlüsselte Panels** ✅: mehrere Panels pro Team, Key verschlüsselt in der DB, auf dem Gerät nur im RAM (lokaler Keyring entfernt)
- **M8 — Cloud-Projekte** ✅: geteilte Projektliste + Beschreibungen, Tab-Leiste Projects/Panels; **M8b** Mitglieder-Verwaltung
- **M9 — Projekt-Detailseite** ✅: GitHub-artige Seite (Overview/Settings, später Issues/Deploys)
- **M10 — Deploy-Historie** ✅: jeder Deploy/Rollback wird pro Projekt aufgezeichnet und angezeigt
- **M11 — Issues** ✅: Issue-Tracker pro Projekt mit Kommentaren, open/closed
- **M12 — Planning (Markdown)** ✅: Beschreibungen/Issues/Kommentare als Markdown, interaktive `- [ ]`-Checklisten; eigener, escapender Renderer (kein Roh-HTML)

### 10.5 Sicherheit

- API-Keys nur verschlüsselt gespeichert (Vault-Master-Key), Entschlüsselung ausschließlich für Mitglieder; auf dem Gerät nur im Speicher, nie auf Platte.
- Anon/Public-Key + Projekt-URL dürfen in der App liegen (Schutz über RLS, nicht über Geheimhaltung); Service-Role-Key und DB-Passwort niemals in die App.
- Der Markdown-Renderer escaped jede Eingabe und lässt nur `http(s)`/`mailto`-Links zu.

### 10.6 Panels/Projects-Rework (v2.2)

Die App wird um einen klaren Schnitt herum neu strukturiert: **Panels = Server-Betrieb**, **Projects = planen/deployen/managen**. Ein Team hat mindestens ein Panel; die Server darin werden als Projekte importiert.

**Grundsatzentscheidung (geklärt):** Server *erstellen/löschen* und RAM/CPU/Disk *setzen* geht mit dem **Client-API-Key nicht** (nur Admin/Application-API, die Anbieter nicht rausgeben). Deshalb: **Import** vorhandener Server statt Erstellen; Limits werden read-only angezeigt; kein „Server mitlöschen".

- **Panels-Tab:** Feather verbindet sich mit **allen** Team-Panels gleichzeitig (Rust-Kern: Map `panel_id → Zugangsdaten`, Server-Befehle + Sockets nach `panel_id` getrennt, Events `server-event-{panel_id}-{identifier}`). Zeigt **alle Server aller Panels** mit Power + Live-Stats + Konsole.
- **Projekt = importierter Server:** „Neues Projekt" → Panel (Pflicht) → vorhandener Server → optional lokaler Ordner. Die lokale Ordner-Bindung ist **pro Gerät** (`project_paths.json`), das Cloud-Projekt bleibt die geteilte Definition.
- **Projekt-Detail-Tabs:** Overview (Beschreibung/Planung + lokaler Ordner), Issues, **Deploy** (Deploy-Button + Fortschritt, Import vom Server, Commit, git-Historie/Rollback, geteilte Deploy-Timeline), **Files** (Server-Browser), Settings. Deploy/History/Files sind aus den Panel-Kacheln hierher gewandert.
- **Deploy-Engine:** bekommt die komplette `ProjectConfig` vom Frontend (Cloud-Projekt + lokaler Ordner); der alte lokale Projekt-Store entfällt.
- **Löschen (2 Stufen):** *Aus Feather entfernen* (Cloud-Projekt weg, lokale Dateien bleiben) und *überall löschen* (Tombstone `project_deletions` (0007) + Cloud-Projekt weg; jeder Client löscht seinen lokalen Ordner beim nächsten Start; Guard gegen flache Pfade).
- **Migrationen:** `0007_project_deletions.sql` ergänzt.
- **Linux-Icon-Fix:** Bundle-`identifier` von `…wingman` auf `…feather` gezogen, damit der Desktop das Fenster seinem `.desktop`-Icon zuordnet.

### 10.7 Cloud-Commits, Profile & Issue-Verknüpfung (v2.3)

v2.3 arbeitet den Deploy/Commit/History/Rollback-Fluss zu **Cloud-Commits** um, gibt Konten und Teams **Profilseiten**, verbindet **Issues mit Deploys/Commits** und lagert Commit-Snapshots auf einen **eigenen Storage-Server** aus. Grundsatz bleibt: Supabase hält nur Metadaten; die einzigen Datei-Bytes in der Cloud sind Commit-Snapshots, und die gehen **nicht** in Supabase Storage.

**Cloud-Commit-Modell (M22).**
- Ein Mitglied arbeitet lokal; der Deploy-Tab zeigt einen **Live-Diff lokal-vs-Server** (aus leichtgewichtigen Content-Manifesten, kein Download nötig).
- **Commit** packt den Arbeitsordner als Snapshot-Zip, lädt ihn über die Edge Function auf den Storage-Server und hängt einen `commits`-Eintrag an das **aktuelle „Deploy"-Bündel** (`deploy_bundles`, genau ein `pending` pro Projekt via Partial-Unique-Index). Alle Mitglieder-Commits sammeln sich dort.
- **Deploy** schickt die Dateien mit der bewährten Engine auf den Server und **released** das Bündel (`release_bundle` speichert das deployte Manifest = neuer Server-Stand, öffnet ein frisches Bündel). Andere Geräte ziehen den neuen Stand per bestehendem Sync-Marker.
- **History** mit Kategorien **Deploys** und **Commits**; Diffs pro Commit (vs. Vorgänger) und pro Deploy (vs. Vor-Deploy), Commit-Detailseiten.
- **Rollback** lädt den Snapshot eines alten Commits vom Storage-Server, entpackt ihn in einen Temp-Ordner und deployt daraus (Working Tree unberührt — analog 6.4, Quelle ist der heruntergeladene Snapshot statt `git archive`).

**Storage-Backend (geheim, für alle Nutzer).**
- Ein dedizierter Pterodactyl-Server hält die Snapshots unter `data/<team>/<project>/{commits,rollbacks}/<id>.zip`. Der API-Key liegt **ausschließlich** in der Supabase Edge Function **`feather-storage`** (Secret `FEATHER_STORAGE_KEY`), nie in der App oder im Repo.
- Die Function authentifiziert den Aufrufer per Supabase-JWT, prüft die Team-Mitgliedschaft (RLS auf `projects`), **leitet den Pfad selbst aus den IDs ab** (Client übergibt nie einen Pfad) und legt den Ordnerbaum beim ersten Schreiben an. Nginx/der Rest des Servers bleiben unberührt.
- **Harter Ausschluss:** Der Rust-Kern (`feather_core::storage`) filtert genau diesen Server (Host + Kurz-ID) aus jeder Serverliste und lehnt jede serverbezogene Operation dagegen ab (`Error::ReservedServer`) — selbst wer dasselbe Panel mit einem berechtigten Key einträgt, kann ihn nie sehen/importieren/deployen.
- Der eigentliche Byte-Transfer läuft im Rust-Kern (`upload_snapshot`/`download_snapshot` via reqwest), also **ohne Browser-CORS**; die Verfügbarkeitsprüfung im Frontend ist bewusst optimistisch.

**Profile & Admin-Rechte (M21).**
- `profiles` und `teams` bekommen `location`, `website`, Logo/Avatar-URL und eine Markdown-`bio`/`description`. Profilseiten für jeden User und jedes Team (GitHub-artig, selbst anpassbar). Team-Seite **nur vom Owner** editierbar (RLS `teams_update` owner-only).
- **Admin-Rechte:** nur der Owner vergibt/entzieht Admin (`set_member_role`, owner-only); direkte `team_members`-Schreibzugriffe sind owner-only, Einladen/Entfernen laufen weiter über die Admin-geprüften RPCs.

**Issues ↔ Deploys/Commits (M23).**
- `issues` bekommen `bundle_id` + `commit_id`. `create_issue` verknüpft ein neues Issue mit dem **aktuellen Deploy**; `assign_issue_commit` pinnt ein gelöstes Issue an den **Commit**, der es behoben hat (verschiebt es in dessen Deploy). Deploy-Seite listet ihre Issues, Commit-Seite die von ihr gelösten Issues.

**Weitere v2.3-Punkte.**
- **M18:** Pre-Deploy-Backup wird verifiziert (Engine pollt bis Erfolg); ein *übersprungenes* Backup zeigt jetzt eine dauerhafte Warnung + Desktop-Benachrichtigung.
- **M19:** Ein-Klick vom Projekt zur Server-Kachel im Panels-Tab (scrollt + hebt hervor).
- **M20:** GitHub-artige Projekt-Overview (Stat-Zeile + Recent-Activity).
- **M17:** vollständige Umbenennung Rust-Crate `wingman-core` → `feather-core`.

**Cloud-Datenmodell-Erweiterung (`supabase/0008`–`0011`).**
- `0008` Profilfelder + `is_team_owner`/`set_member_role` + owner-only-Policies + `create_team` mit Profilfeldern.
- `0009` `commits` + `deploy_bundles` + `current_bundle`/`create_commit`/`release_bundle`.
- `0010` Manifest-Spalten + `finalize_commit`/`server_manifest` + manifest-fähiges `release_bundle`.
- `0011` `issues.bundle_id`/`commit_id` + `assign_issue_commit`, `create_issue` verknüpft aktuelles Bündel.

**Neue Meilensteine (v2.3):** M17 (Rename) · M18 (Backup-Verifikation) · M19 (Projekt→Panels) · M20 (Overview) · M21 (Profile + Admin) · M22a–f (Cloud-Commits/History/Rollback + Storage-Backend) · M23 (Issue-Verknüpfung) — alle abgeschlossen.

**Bekannte Kante:** Nach einem Rollback wurde die Server-Manifest-Referenz für den Diff nicht aktualisiert; der nächste Diff maß gegen den letzten *Deploy*, nicht den Rollback-Stand. **In v2.5 behoben** (siehe 10.9): der Rollback setzt die Baseline jetzt auf den wiederhergestellten Deploy.

### 10.8 Projekt-Experience: Diffs, Interaktivität & Aufräumen (v2.4)

v2.4 macht alles **innerhalb eines Projekts** übersichtlicher, klickbarer und ehrlicher. Kein neues Datenmodell-Fundament, sondern gezielte Ausbauten und Bugfixes rund um Diff, Deploy, Issues, Profile, Files und Panels. Ergänzt die Migrationen `supabase/0012`–`0013`.

**Diff-Engine & Baseline (M25).**
- **Zeilengenaue Datei-Diffs:** `linediff.ts` (LCS-basiert, CRLF-normalisiert, Guard bei >4000 Zeilen) + `FileDiff.svelte`-Modal. Klick auf eine geänderte Datei zeigt hinzugefügte/entfernte/geänderte Zeilen — im Deploy-Tab (Server-Datei vs. lokal), in der Commit-Historie (Commit-Snapshot vs. Vorgänger, via `snapshot_file`) und in der Uncommitted-Ansicht.
- **Baseline-Fix (0013):** Der „Changes since last deploy"-Diff maß gegen das letzte *released* Bündel — bei frisch importiertem Projekt (noch kein Deploy) galt darum **jede** Datei als neu. Neu: ein projektweiter Server-Stand-Baseline (`projects.server_manifest`, `set_server_manifest`, angepasstes `server_manifest`/`release_bundle`), gesetzt beim Import **und** beim Release.

**Deploy-Tab-Ausbau (M24, M30).**
- **Uncommitted-Ansicht:** getrennter Block „Uncommitted local changes" (lokal vs. neuester gespeicherter Commit im aktuellen Deploy), klickbar auf Datei-Ebene — zeigt, was noch commitet werden muss, unabhängig vom Gesamt-Deploy-Diff.
- **Auto-Import beim Linken:** ein leerer, frisch gelinkter Ordner zieht sofort einmal die Server-Dateien (Baseline wird gesetzt).
- **Deploy-History klickbar (M29):** Zeilen der Deploy-Timeline öffnen die geteilte History fokussiert auf diesen Deploy (Match über Release-Zeit), mit Commits + klickbaren Datei-Diffs.

**Issues (M29).**
- **Geschlossene Issues verknüpfbar:** Der „Fixed in"-Picker erschien früher nur bei Issues mit `bundle_id` und listete nur die Commits *dieses* Bündels — ein Fix in einem späteren Zyklus (Normalfall bei geschlossenen Issues) war nicht zuordenbar. Neu: der Picker zeigt **alle Projekt-Commits**, gruppiert nach Deploy (`<optgroup>`), für jedes Issue.

**Files-Tab (M26).**
- **Server-Dateien direkt editieren:** `FileEditor.svelte` lädt eine Datei (`read_server_file`), erlaubt Bearbeiten und speichert zurück (`write_server_file`) — Arbeiten direkt auf dem Server ohne lokale Kopie. Textdateien bis ~1 MB; Nicht-Text/zu groß → read-only.

**Panels-Tab (M27).**
- **Disk-Verbrauch** je Server-Kachel (neben CPU/RAM). Server mit aktivem Feather-Projekt sind **markiert** (Projekt-Chip) und **klickbar** → direkt ins Projekt.

**Profile & Team-Seiten (M28).**
- **Quer-Verlinkung:** User-Profil listet **Teams** und **Projekte** (klickbar); Team-Seite listet alle **Mitglieder** (→ Profil) und **Projekte**. Navigation Profil ⇄ Team ⇄ Mitglied ⇄ Projekt, RLS-scoped (`listUserTeams`/`listUserProjects` via `team_members`/`projects`).

**Projekt-Logo (M24).**
- `projects.logo_url` (0012); Logo auf Projektseite, in der Liste und in Profil-/Team-Chips; unter Settings setzbar.

**Overview-Fixes (M24).**
- Stat-Kacheln + Recent-Activity aktualisieren jetzt bei jedem Öffnen des Overview (vorher einmalig geladen → veraltet). Lokaler-Ordner-Teil von Overview nach **Settings** verschoben. Team-Chip (→ Team-Seite) und klickbarer Ersteller im Overview.

**Cloud-Datenmodell-Erweiterung (`supabase/0012`–`0013`).**
- `0012` `projects.logo_url`.
- `0013` `projects.server_manifest` + `set_server_manifest` + Baseline-lesendes `server_manifest`/`release_bundle`.

**Neue Meilensteine (v2.4):** M24 (Overview-Rework & Fixes) · M25 (Diff-Baseline + Datei-Diffs) · M26 (Files editieren) · M27 (Panels Disk + Marker) · M28 (Profile/Team-Quer-Links) · M29 (Issues + Deploy-History-Interaktivität) · M30 (Uncommitted-Ansicht & Politur) · M31 (Version 2.4.0 + Docs) — alle abgeschlossen.

### 10.9 Delta-Commits, Bündel-Deploy, Auto-Sync & Deploy-Rollback (v2.5)

v2.5 baut das Commit/Deploy-Modell um: Ein **Commit speichert nur sein Delta**, und ein **Deploy wendet die akkumulierten Deltas des aktuellen Bündels an — und sonst nichts**. Ein Deploy ist damit exakt die Summe seiner Commits. Kein neues DB-Schema; die Änderung liegt im **Storage-Format** (Commit-Zips sind jetzt Deltas) und in der Engine.

**Delta-Commit (M32, M34).**
- Core-Primitive (`snapshot.rs`): `delta_zip(root, base)` packt nur die geänderten Dateien und liefert `(zip, resultierendes Vollmanifest, gelöschte Pfade)`; `materialize_deltas(base, deltas, dest)` überlagert eine geordnete Delta-Kette und liefert Netto-Löschungen + resultierendes Manifest. Unit-getestet (u. a. „zwei Commits auf verschiedene Dateien kombinieren sich").
- Commit-Fluss: `upload_commit_delta` lädt gegen die **akkumulierte Baseline** (Server-Manifest ⊕ vorherige Bündel-Commits = neuestes Commit-Manifest) nur das Delta hoch; `finalize_commit` speichert weiterhin das **volle resultierende Manifest**, damit ein Deploy das Bündel anwenden kann.

**Bündel-Deploy (M33, M34).**
- `start_bundle_deploy` lädt alle Commit-Deltas des Bündels, leitet je Commit die Löschungen aus aufeinanderfolgenden Manifesten ab und wendet sie über der Server-Baseline an (`apply_bundle` → `materialize_deltas` → Upload der Netto-Änderungen + Löschen der Netto-Entfernten). **Kein Build-Schritt**, kein lokaler Ordner als Quelle — auch ein Mitglied ohne lokalen Ordner kann deployen. Leeres Bündel → „nothing to deploy".
- Integrationstest (Mock-Panel): zwei Commits auf verschiedene Dateien landen kombiniert; ein späteres Bündel ändert/löscht; leeres Bündel scheitert.

**History (M35).**
- Deploy-Detail zeigt nur noch **seine Commits** (kein „Changes on the server" — ein Deploy verändert nichts Eigenes). Datei-Diffs für Delta-Zips repariert: `snapshot_file` meldet `found`; ein Walk (`fileContentAt`) holt den echten alten/neuen Inhalt aus dem jüngsten Commit, der die Datei schrieb. Gilt auch für die Uncommitted-Ansicht (Fallback auf die Live-Server-Datei bei geerbten Dateien).

**Auto-Sync (M35b).**
- Der Deploy-Tab pollt den Server-Marker (beim Öffnen + alle 30 s) und zieht per `pull("sync")` einen neueren Deploy in den lokalen Ordner, sobald der Arbeitsbaum sauber ist. Dirty → Banner statt Überschreiben. (Die Marker-Schreibung war vorhanden, das Polling im Cloud-UI fehlte.)

**Deploy-Rollback via Vollsnapshot (M35c).**
- Bei jedem Deploy wird der **komplette deployte Baum** vom Server geladen (`sync::download_server_tree`) und als Vollsnapshot gespeichert (`kind="rollback"`, id = Bündel-ID) — best-effort, scheitert nie den Deploy.
- Rollback zielt jetzt auf **Deploys** (nicht einzelne Commits): `rollback_to_snapshot(kind, snapshot_id)` lädt den Vollsnapshot und deployt ihn (Pipeline löscht seither hinzugefügte Dateien). Der Button wanderte von der Commit- auf die Deploy-Detailseite. Nach dem Rollback wird die Server-Baseline auf den wiederhergestellten Deploy gesetzt — **die bekannte Rollback-Diff-Kante aus 10.7 ist damit behoben.**

**Kein neues Schema.** Das DB-Modell (`0001`–`0013`) bleibt unverändert; nur das Storage-Zip-Format (Delta statt Voll-Snapshot pro Commit) und die Rollback-Semantik ändern sich. Alt-Commit/Deploy-Historie aus einer früheren Version ist damit inkompatibel (Storage-Bereich frisch beginnen; die Datenbank bleibt unberührt).

**Neue Meilensteine (v2.5):** M32 (Delta-Primitive) · M33 (Bündel-Deploy) · M34 (Delta-Commit + Bündel-Deploy Frontend) · M35 (History: Deploy = Summe der Commits) · M35b (Post-Deploy-Sync) · M35c (Deploy-Rollback via Vollsnapshot) · M36 (Version 2.5.0 + Docs) — alle abgeschlossen.

### 10.10 Workflow & Politur: Commit-Details, Vollbild-Views, Navigations-Stack, Bild-Upload, Statistiken (v2.6)

v2.6 politur­t die Oberfläche und den Arbeitsfluss: reichhaltigere Commits, echte Seiten-Navigation statt Drawer/Modals, Datei-Upload für Bilder, ein geführter Team-Erstellungs-Fluss und Statistiken auf Team-/User-Seiten. Ergänzt die Migrationen `supabase/0014`–`0016` und den öffentlichen Storage-Bucket `images`.

**Commit-Details, -Diffs & -Entfernen (M41).**
- Ein Commit hat jetzt **Name + optionale Markdown-Beschreibung** (`0016`: Spalte `description`, `create_commit` um Parameter erweitert). Das Commit-Formular nutzt den Rich-Text-Editor.
- Jeder Commit im aktuellen Deploy ist **aufklappbar** und zeigt seine Datei-Änderungen (Diff gegen die akkumulierte Baseline der vorherigen Commits); Klick auf eine Datei öffnet den Zeilen-Diff.
- Der **neueste** Commit eines noch nicht deployten Bündels ist **entfernbar** (LIFO — spätere Commits bauen auf früheren auf): `delete_commit` prüft Mitgliedschaft, `pending`-Status und dass es der neueste Commit des Bündels ist.

**Vollbild-Views statt Drawer/Modals & echter Navigations-Stack (M42).**
- Ein zentraler **Navigations-Stack** in `AppShell` trägt jede Seite (Projekt, User-Profil, Team-Seite, Panels-mit-Fokus); der **Zurück-Button führt immer zur tatsächlich vorherigen Seite** — ein aus einem Projekt geöffnetes Profil kehrt zum Projekt zurück, nicht zur Projektliste. Tab-Klicks setzen den Stack auf ihre Wurzel zurück. Die Projektliste zieht ihre Daten (Projekte, Panels, Mitglieder) jetzt vom Shell.
- Die vormals eingeschobenen Drawer und Pop-up-Modals sind **Vollbild-Seiten mit eigenem „← Zurück"**: Server-Konsole, Projekt-History/Rollback, Server-Datei-Editor und Datei-Diffs (in Commits, Uncommitted-Ansicht und History).

**Bild-Upload per Datei (M39, Bucket via `0014`).**
- Avatare und Logos (User, Team, Projekt) werden über einen **Datei-Picker** gewählt und in den öffentlichen Supabase-Storage-Bucket **`images`** geladen (`ImagePicker.svelte`, `uploadImage`), statt eine URL einzufügen. `0014` legt den Bucket + Read-for-all/Write-for-authenticated-Policies an (idempotent).

**Team-Erstellungs-Wizard & Einladen per Username (M40, `0015`).**
- Team anlegen läuft als **Wizard** (Name → Logo → About) statt als ein Formular (`TeamSetup.svelte`).
- **Mitglied hinzufügen per E-Mail oder Username:** `0015` baut `invite_member` so um, dass der Bezeichner erst gegen `auth.users` (E-Mail), dann gegen `profiles` (Username) gematcht wird — gleiche Signatur.

**Prettier Eingaben & Markdown-Toolbar (M38).**
- Einheitlicher Stil für `input`/`textarea`/`select` (abgerundet, Focus-Glow, eigener Dropdown-Chevron). Beschreibungs-/README-Felder nutzen `MarkdownEditor.svelte` mit Toolbar (Fett, Kursiv, Überschrift, Listen, Zitat, Code, Link).

**Statistiken (M43).**
- **Team-Seite:** Stat-Zeile (Projekte, Mitglieder, aggregierte offene Issues + Deploys über alle Projekte). **User-Seite:** Stat-Zeile (Teams, Projekte). Die Projekt-Seite trug ihre Stat-Zeile bereits.

**Emojis entfernt (M37).**
- Verbliebene Emoji/Piktogramme in der Oberfläche durch Text bzw. typografische Zeichen ersetzt.

**Cloud-Datenmodell-Erweiterung (`supabase/0014`–`0016`).**
- `0014` Storage-Bucket `images` + Policies.
- `0015` `invite_member` per E-Mail **oder** Username.
- `0016` `commits.description` + `delete_commit` (neuesten Commit eines pending-Bündels entfernen).

**Neue Meilensteine (v2.6):** M37 (Emojis entfernen) · M38 (Prettier Inputs + Markdown-Toolbar) · M39 (Bild-Upload) · M40 (Team-Wizard + Einladen per Username) · M41 (Commit-Name/-Beschreibung, -Diffs & -Entfernen) · M42 (Navigations-Stack + Vollbild-Views) · M43 (Statistiken Team/User) · M44 (Version 2.6.0 + Docs) — alle abgeschlossen.

**Read-only Fremd-Projekte (v2.6.1, M45).**
- Ein Projekt eines *anderen* Teams (dem man auch angehört) war nicht öffenbar („This project is no longer available."), weil der Shell nur die Projekte des aktiven Teams im Speicher hält. Jetzt lädt der Shell es bei Bedarf (`getProject` + Name/Mitglieder/Panel seines Teams) und verbindet dessen Panel in-memory für Datei-Lesezugriff. Ein `canWrite`-Flag zieht sich von `AppShell` durch `ProjectDetail` in alle Unteransichten: erlaubt sind Overview, Files (nur lesen), volle History (Deploys & Commits mit Diffs) und Issues erstellen/kommentieren; gesperrt sind Settings, Deploy, Commit, Import, Rollback, Datei-Bearbeiten und Issues schließen/wieder öffnen. Kein neues Schema.

**Öffentliches Lesen: Profile zeigen das volle Bild (v2.6.2, M46, `supabase/0017`).**
- Profil-/Team-Seiten zeigten nur die Teams/Projekte, die man mit der Person **teilt** (RLS `is_team_member`). `0017` öffnet **Lesezugriff** für angemeldete Nutzer auf `teams`, `team_members`, `projects`, `deploys`, `deploy_bundles`, `commits`, `issues`, `issue_comments` — Feather ist GitHub-artig und die Projekte sind Open Source. Ein Profil listet damit **alle** Teams/Projekte der Person, und man kann ein fremdes Projekt read-only durchstöbern.
- **Schreibrechte unverändert**; **Panels bleiben Mitglieder-only** (verschlüsselte Keys), und die Commit-/Deploy-Bytes lädt weiterhin nur die mitgliedschaftsgeprüfte Storage-Function. Der Team-Picker (`listTeams`) filtert nun explizit über die eigenen Mitgliedschaften statt über RLS. Ein zusätzliches `canInteract`-Flag (Mitglied des Projekt-Teams) hält „Issue erstellen/kommentieren" nur dort sichtbar, wo die RPCs es erlauben — ein reiner Außenstehender sieht Issues nur lesend.

**Commit-/Deploy-Felder & echte Auto-Sync (v2.6.3, M47, `supabase/0018`).**
- **Formulare gestapelt:** Commit- und Deploy-Formular haben Name (flach) über Beschreibung (`MarkdownEditor`) über Button, statt nebeneinander.
- **Deploy mit Name + Beschreibung:** `0018` ergänzt `deploy_bundles.description` und erweitert `release_bundle` um `p_description`; die Deploy-Detailseite zeigt beides.
- **App-weite, automatische Team-Sync:** Das Sync-Polling wandert vom Deploy-Tab in einen globalen Dienst in `AppShell` (`sync.svelte.ts`), der alle lokal verknüpften Projekte des aktiven Teams beim Start und alle 25 s prüft — die App muss nur offen sein, nicht der Deploy-Tab; offline verpasste Deploys kommen beim nächsten Start. Neuer Command `list_project_paths`.
- **Inhalts-Manifest-Guard statt „git dirty":** Deploy-Marker und `DeployRecord` tragen jetzt ein Inhalts-Manifest (Pfad→Hash). `check_remote_deploy` liefert `conflict` statt `dirty`: ein neuer Deploy wird automatisch geladen, **außer** eine noch nicht deployte lokale Änderung an einer Datei, die der Deploy *nicht* ändert, würde überschrieben (`sync::sync_conflict`, unit-getestet + zwei neue Integrationstests). `PullMode::SyncIfClean` → `PullMode::Sync` (bedingungslos, der Aufrufer entscheidet). Kein Overwrite von unbestätigter Arbeit.

**Commit-Diff-Fix: Server-Pfad (v2.6.4, M48).**
- Der „Vorher"-Teil eines Commit-Datei-Diffs (der aktuell deployte Stand) wurde mit dem **rohen projekt-relativen Pfad** vom Server gelesen — ohne führenden Slash und ohne das Deploy-Zielverzeichnis (`target_dir`), unter dem die Datei auf dem Server liegt. Wings konnte den Pfad nicht auflösen und meldete `DaemonConnectionException` (HTTP 500), der Diff brach ab. `CloudCommits.serverPath` baut jetzt den korrekten absoluten Pfad (`/<target_dir>/<pfad>`) für alle drei Diff-Leser; `deployedFile` degradiert auf „nur neue Version", falls der Server die Datei trotzdem nicht liefert. Reiner Frontend-Fix, kein Schema.

**Neue Meilensteine (v2.6-Patches):** M45 (Read-only Fremd-Projekte · 2.6.1) · M46 (Öffentliches Lesen · 2.6.2) · M47 (Commit-/Deploy-Felder + Auto-Sync · 2.6.3) · M48 (Commit-Diff Server-Pfad-Fix · 2.6.4) — abgeschlossen.

## 11. Feather im Web: Webapp, Homepage, Suche & Panel-Proxy (v3.0)

v3.0 bringt eine **Webversion** von Feather — dieselbe App im Browser, aber **betrachtungs-orientiert**: Projekte durchstöbern, suchen, Code online ändern, Issues ansehen/erstellen, Live-Konsole zuschauen. Was lokal ist (Committen, Deployen, Rollback, Ordner verknüpfen), bleibt der Desktop-App vorbehalten. **An der Installations-App wird nichts geändert** — die Webapp verwendet deren Svelte-Komponenten unverändert. Dazu eine **Homepage** und eine **GitHub-artige Suche**, und die Seite wird bei **jedem Release automatisch in den Webroot des Storage-Servers** geladen.

### 11.1 Grundsatzentscheidungen (v3.0)

| Thema | Entscheidung | Begründung |
|---|---|---|
| Wiederverwendung | Die Webapp **importiert die `src`-Komponenten direkt** | Garantiert identisches Aussehen/Verhalten; die Desktop-App bleibt unberührt |
| API-Umleitung | Ein Vite-Plugin (`vite.web.config.ts`) leitet `src/lib/api.ts` → `web/lib/api.web.ts` um (nur im Web-Build) | Die Komponenten rufen im Browser statt des Tauri-Cores eine Web-Implementierung; die App-Bundles ändern sich nicht |
| Panel-Zugriff | **Neue Edge Function `feather-panel`** als Browser→Panel-Proxy | Browser darf keinen Panel-Key halten und Panels nicht direkt cross-origin aufrufen |
| Zugang | **Öffentlich, auch ohne Konto** (Lesen); Schreiben + Server-Dateien/Konsole erfordern Login/Mitgliedschaft | GitHub-artig, Open Source; Panels bleiben Mitglieder-only |
| Auto-Deploy | Bei **jedem GitHub-Release** in `/home/container/webroot/` | Website aktualisiert sich mit der App; die Rollbacks in `/data` bleiben unberührt |

### 11.2 Aufbau

- **`web/`** — eigenständige Vite-SPA. `main.ts` mountet `App.svelte`, das über einen Hash-Router (`web/lib/router.svelte.ts`, Routen `/`, `/search`, `/login`, `/u/:id`, `/t/:id`, `/p/:id`) zwischen **Home**, **SearchPage**, **AuthScreen**, **UserProfile**, **TeamProfile** und **WebProject** wechselt. `UserProfile`/`TeamProfile` sind die **unveränderten** Desktop-Komponenten.
- **`web/lib/api.web.ts`** — Web-Ersatz für `src/lib/api.ts`: Datei-Listing/-Lesen/-Schreiben/Ordner/Löschen laufen über den `feather-panel`-Proxy; `snapshotFile` holt Commit-Zips über `feather-storage` (`get`) und entpackt sie im Browser mit **fflate**; `readLocalFile` wirft (kein lokaler Ordner im Web).
- **`web/lib/panel.ts`** — kleiner Client für den `feather-panel`-Endpunkt (Session-Token oder anon).
- **`web/lib/search.ts`** — `searchTeams`/`searchProjects`/`searchUsers` per Supabase-`ilike`.
- **`web/components/`** — `WebHeader` (Logo/Suche/Login), `Home` (Landing), `SearchPage` (Tabs Projekte/Teams/User), `WebProject` (Projektseite mit Tabs Overview/Issues/Files/History/Console; `isMember` steuert Schreib-/Interaktionsrechte), `WebConsole` (Browser-Websocket zum Wings-Daemon, speist die wiederverwendete `ConsoleView`).

Nur sechs API-Funktionen brauchten einen Web-Shim (Datei-Zugriff in `FileBrowser`/`FileEditor` und `snapshotFile`); reine Cloud-Komponenten (Profile, Issues, Overview, History) laufen ohne jede Anpassung.

### 11.3 `feather-panel` Edge Function

Authentifiziert den Aufrufer per Supabase-JWT, liest die `panels`-Zeile unter RLS (nur für Team-Mitglieder), entschlüsselt den Key serverseitig via `panel_api_key`-RPC und proxyt genau **eine** Operation ans Panel: `servers`, `resources`, `websocket`, `list`, `read`, `write`, `create-folder`, `delete`, `command`. Der reservierte Storage-Server wird als Ziel abgelehnt. Der Panel-Key erreicht den Browser nie. Keine Secrets nötig (URL/Key kommen pro Request aus der DB). Siehe `supabase/functions/feather-panel/README.md`.

### 11.4 Öffentliches Lesen für Anonyme (`supabase/0019`)

`0019` erweitert die `0017`-Lesepolicies von „angemeldet" auf `using (true)` für `teams`, `team_members`, `projects`, `deploys`, `deploy_bundles`, `commits`, `issues`, `issue_comments` — damit auch abgemeldete Web-Besucher browsen können. **Schreibrechte unverändert; `panels` bleiben Mitglieder-only.** Idempotent; nur für die Webapp nötig, die Desktop-App ist unberührt.

### 11.5 Auto-Deploy in den Webroot

`scripts/deploy-web.mjs` lädt das gebaute `web/dist` (als `web.tar.gz`) über die Pterodactyl-Client-API in `/webroot`: Webroot leeren → per Signed-URL hochladen → dekomprimieren → Archiv löschen. Ein `deploy-web`-Job in `.github/workflows/release.yml` baut die Webapp und ruft das Skript bei jedem Tag-Release; ohne die `WEBROOT_*`-Secrets überspringt es sich (Exit 0), das Release bleibt grün. Der Server-Aufbau (`/home/container/webroot` für die Seite, `/home/container/data` für Rollbacks/Commits) bleibt unangetastet.

### 11.6 Verifikation & Unberührtheit der App

Der Web-Build (`npm run web:build`) und `npm run web:check` laufen zusätzlich zur bestehenden App-Verifikation. Entscheidend: `npm run build` erzeugt **byte-identische** App-Bundles wie vor der Web-Arbeit, und `npm run check`/`npm test`/`cargo test` bleiben unverändert grün — die Installations-App ist nachweislich unverändert.

**Web-Deploy-Fix (v3.1, M54).**
- Der `deploy-web`-Job brach bei jedem Release mit `TypeError: res.text is not a function` ab. `scripts/deploy-web.mjs` reichte der `must()`-Hilfe das **nicht-awaitete** `fetch()`/Panel-Request-**Promise** statt der aufgelösten `Response`, sodass `.ok`/`.text()` auf einem Promise landeten. `must()` **awaited jetzt sein Argument** (Response *oder* Promise\<Response\>) und deckt damit alle vier Upload/Delete/Decompress-Aufrufe ab. Reiner CI-Skript-Fix; App- und Web-Bundles unverändert.

**Web-Fixes & lebendige Homepage (v3.2, M55).**
- **CORS-Fix (Files/Diffs/Konsole „Failed to fetch"):** `feather-panel` und `feather-storage` erlaubten in `Access-Control-Allow-Headers` nur `authorization, content-type`. Der Browser-Supabase-Client sendet aber zusätzlich `apikey` (und `x-client-info`), sodass der **CORS-Preflight** scheiterte und `fetch` gar nicht erst rausging. Beide Funktionen erlauben die Header nun → **beide Edge Functions müssen neu deployt werden**. (Warum REST trotzdem lief: Supabases eigener REST-Gateway erlaubt `apikey` bereits.)
- **Profilbilder:** Hochgeladene Bilder (Supabase Storage) luden immer; „nicht ladende" Bilder waren **externe, ablaufende URLs** (z. B. ein Discord-CDN-Link, der nach ~1 Tag 404t). Empfehlung: Bild hochladen statt Fremd-URL. Der Web-Header-Avatar fällt bei Ladefehler auf die Initialen zurück.
- **Files/Konsole nur für Mitglieder:** Beide gehen über das mitglieder-only Panel; die Tabs erscheinen jetzt nur für eingeloggte Mitglieder des Projekt-Teams (serverseitig war es schon abgesichert, die Tabs waren nur irreführend sichtbar). Overview/Issues/History bleiben öffentlich.
- **Lebendige Homepage (`web/lib/github.ts`):** liest die öffentliche GitHub-API (immer aktuell, ohne Rebuild): OS-erkennender Download (passendes Installer-Asset des neuesten Releases), „What's new"-Changelog (letzte Releases, Markdown), Stats (Stars/Forks/Version) und Contributor-Avatare.
- **Account-Menü im Web-Header:** Avatar (Initialen-Fallback) mit „Your profile", „Your teams"-Liste und „Log out" statt nur „Your profile".
- **„Open in desktop app":** Projektseite bietet einen `feather://`-Deep-Link für Committen/Deployen (was das Web nicht kann).

**Web-Fetch-Fix, Server-Typ, Team-Löschung, Settings (v3.3, M56–M61).**
- **„Failed to fetch" endgültig behoben:** Die v3.2-CORS-Header allein reichten nicht — Supabases Gateway prüft standardmäßig das JWT und lehnt den Browser-CORS-**Preflight** (OPTIONS ohne Authorization) mit 401 ohne CORS-Header ab. Neue `supabase/config.toml` setzt `verify_jwt = false` für alle Funktionen (sie authentifizieren selbst); **beide Funktionen neu deployen**. Zusätzlich Import auf `npm:@supabase/supabase-js@2` umgestellt (klärt die roten Editor-Squiggles).
- **Server-Typ-Erkennung (M58):** Aus dem Docker-Image abgeleiteter Server-Typ (Website/Node.js/Python/Go/Minecraft/FiveM/DB/…) via gemeinsamem `src/lib/serverType.ts`; angezeigt als Chip im Panels-Tab (ServerCard) und auf der Web-Projektseite. `docker_image` neu im Core-`Server` + TS-Typ; `feather-panel` `details`-Action. `webCapable`-Flag für kommende Web Deployments.
- **Team löschen (M61):** `supabase/0020` mit owner-only `delete_team()` (Cascade über alle team-scoped Tabellen); `cloud.deleteTeam()` + Danger-Zone in der (geteilten) `TeamProfile`-Bearbeitung.
- **Web-Settings (M61):** Über das Avatar-Menü erreichbar (`/settings`): App-Version + Update-Abgleich gegen das neueste GitHub-Release, Benachrichtigungs-Toggle (localStorage), Abmelden, Account-Löschung via neuer `delete-account` Edge Function (Service-Role: löscht besessene Teams, dann den Auth-User).

**„Open in desktop app" via Deep-Link (v3.3, M60).**
- Die Desktop-App registriert das `feather://`-URL-Schema (Tauri `deep-link` + `single-instance` Plugins, Schema in `tauri.conf.json`, `deep-link:default` Capability). `lib.rs` leitet geöffnete URLs an das Frontend weiter (Event `deep-link`) bzw. legt die Kaltstart-URL in `AppState.pending_deep_link` ab (Command `take_pending_deep_link`); eine zweite Instanz (Browser-Handoff unter Linux/Windows) reicht ihr argv an die laufende Instanz und fokussiert das Fenster. `AppShell` routet `feather://project|team|user/<id>` in den Nav-Stack. Der Web-Button `openInDesktop` sendet genau diese URLs.

**Noch offen (nächster Batch):** M57 lesbare/hashfreie URLs, M59 Web Deployments (`/webdeployment/<slug>/`), Planning/Organisations-Tab, In-Feather-Servererstellung.

**Neue Meilensteine (v3.0):** M50 (`feather-panel` Edge Function) · M51 (`supabase/0019` öffentliches anon-Lesen) · M52 (Web-SPA: Homepage, Suche, Ansichts-Seiten, Konsole) · M53 (CI-Webroot-Deploy, Version 3.0.0 + Docs) · M54 (Web-Deploy-Fix · 3.1.0) · M55 (Web-CORS-Fix, Mitglieder-Gating, lebendige Homepage, Account-Menü · 3.2.0) · M56/M58/M60/M61 (Web-Fetch-Fix, Server-Typ, Deep-Link, Team-Löschung, Settings · 3.3.0) — abgeschlossen.
