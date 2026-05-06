mod audio;
mod cache;

use tauri::Manager;

#[derive(serde::Serialize)]
pub struct DisplayInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[tauri::command]
fn enter_kiosk_mode(window: tauri::Window) -> Result<(), String> {
    window
        .set_fullscreen(true)
        .map_err(|e| e.to_string())?;
    window
        .set_decorations(false)
        .map_err(|e| e.to_string())?;
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn exit_kiosk_mode(window: tauri::Window) -> Result<(), String> {
    window
        .set_always_on_top(false)
        .map_err(|e| e.to_string())?;
    window
        .set_decorations(true)
        .map_err(|e| e.to_string())?;
    window
        .set_fullscreen(false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_cursor_visible(window: tauri::Window, visible: bool) -> Result<(), String> {
    window
        .set_cursor_visible(visible)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_displays(window: tauri::Window) -> Result<Vec<DisplayInfo>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|e| e.to_string())?;

    Ok(monitors
        .iter()
        .map(|m| {
            let size = m.size();
            DisplayInfo {
                name: m.name().cloned().unwrap_or_default(),
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
            }
        })
        .collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize native audio engine
            let engine = audio::AudioEngine::new(app.handle().clone());
            app.manage(engine);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            enter_kiosk_mode,
            exit_kiosk_mode,
            set_cursor_visible,
            get_displays,
            audio::cmd_audio_load,
            audio::cmd_audio_prefetch,
            audio::cmd_audio_play,
            audio::cmd_audio_pause,
            audio::cmd_audio_stop,
            audio::cmd_audio_seek,
            audio::cmd_audio_set_volume,
            audio::cmd_audio_subscribe,
            cache::cmd_cache_status,
            cache::cmd_cache_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
