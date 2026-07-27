//! Thin Tauri shell over `feather-core`: window setup, managed state and the
//! IPC commands the Svelte frontend calls.

mod commands;

use commands::{ActivePanel, SocketHandle};
use feather_core::ConfigStore;
use std::collections::HashMap;
use tauri::{Emitter, Manager};

pub struct AppState {
    store: ConfigStore,
    /// Every panel connected this session, keyed by its cloud panel id. A team
    /// can have several panels connected at once (the Panels tab shows all
    /// their servers). Credentials come from the cloud (decrypted per team
    /// member) and are held in memory only — never on local disk.
    panels: std::sync::Mutex<HashMap<String, ActivePanel>>,
    /// One live websocket per subscribed server, keyed by (panel id, server
    /// identifier) so identifiers can't collide across panels.
    sockets: tokio::sync::Mutex<HashMap<(String, String), SocketHandle>>,
    /// Project ids with a deploy in flight — guards against double deploys.
    deploys: tokio::sync::Mutex<std::collections::HashSet<String>>,
    /// A `feather://…` URL the app was cold-started with, held until the
    /// frontend is ready to consume it (via `take_pending_deep_link`).
    pending_deep_link: std::sync::Mutex<Option<String>>,
}

/// Forward a `feather://…` deep link to the frontend, or stash it until the UI
/// is ready if it isn't listening yet.
fn deliver_deep_link(app: &tauri::AppHandle, url: String) {
    if let Some(state) = app.try_state::<AppState>() {
        *state.pending_deep_link.lock().unwrap() = Some(url.clone());
    }
    let _ = app.emit("deep-link", url);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_focus();
    }
}

/// Hand the frontend the pending cold-start deep link (once), clearing it.
#[tauri::command]
fn take_pending_deep_link(state: tauri::State<'_, AppState>) -> Option<String> {
    state.pending_deep_link.lock().unwrap().take()
}

pub fn run() {
    tauri::Builder::default()
        // Single-instance must be registered first: on Linux/Windows a second
        // launch (the browser handing off a feather:// link) forwards its argv
        // to the running app instead of opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("feather://")) {
                deliver_deep_link(app, url.clone());
            } else if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(AppState {
                store: ConfigStore::new(dir),
                panels: std::sync::Mutex::new(HashMap::new()),
                sockets: tokio::sync::Mutex::new(HashMap::new()),
                deploys: tokio::sync::Mutex::new(std::collections::HashSet::new()),
                pending_deep_link: std::sync::Mutex::new(None),
            });

            use tauri_plugin_deep_link::DeepLinkExt;
            // Register the scheme at runtime (needed for dev + Linux/Windows;
            // the installer registers it for release builds too).
            #[cfg(any(target_os = "linux", windows))]
            let _ = app.deep_link().register("feather");

            // The URL the app was launched with, if any (cold start).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.into_iter().next() {
                    *app.state::<AppState>().pending_deep_link.lock().unwrap() =
                        Some(url.to_string());
                }
            }

            // URLs opened while the app is already running.
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().into_iter().next() {
                    deliver_deep_link(&handle, url.to_string());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_deep_link,
            commands::test_connection,
            commands::set_active_panel,
            commands::clear_active_panel,
            commands::list_servers,
            commands::server_resources,
            commands::set_power,
            commands::subscribe_server,
            commands::unsubscribe_server,
            commands::send_console_command,
            commands::set_project_path,
            commands::get_project_path,
            commands::list_project_paths,
            commands::remove_project_path,
            commands::remove_local_project,
            commands::deploy_project,
            commands::deploy_bundle,
            commands::rollback_project,
            commands::rollback_to_snapshot,
            commands::pull_project,
            commands::check_remote_deploy,
            commands::repo_status,
            commands::commit_project,
            commands::project_manifest,
            commands::project_diff,
            commands::upload_commit_snapshot,
            commands::upload_commit_delta,
            commands::snapshot_file,
            commands::project_history,
            commands::deploy_status,
            commands::list_server_files,
            commands::delete_server_files,
            commands::create_server_folder,
            commands::read_server_file,
            commands::write_server_file,
            commands::read_local_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
