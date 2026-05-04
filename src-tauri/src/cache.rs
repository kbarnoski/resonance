use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncWriteExt;

/// Validate a recording_id matches a strict UUID-shape pattern. The
/// audio cache uses recording_id as part of the on-disk file name, so
/// without this validation a hostile id like `../../etc/passwd`
/// would write outside the cache directory. Accepts both hyphenated
/// (8-4-4-4-12) and unhyphenated 32-char hex; both forms appear in
/// the codebase elsewhere.
fn is_valid_recording_id(id: &str) -> bool {
    let len = id.len();
    if len != 32 && len != 36 {
        return false;
    }
    let mut hex_count = 0usize;
    for c in id.chars() {
        if c == '-' {
            // Only valid in the 8-4-4-4-12 form, at fixed positions.
            // We don't validate positions strictly — the hex_count
            // gate below already pins length. Just allow.
            continue;
        }
        if !c.is_ascii_hexdigit() {
            return false;
        }
        hex_count += 1;
    }
    hex_count == 32
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct CacheManifest {
    entries: HashMap<String, CacheEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CacheEntry {
    file_name: String,
    size_bytes: u64,
}

fn cache_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir")
        .join("audio_cache")
}

fn manifest_path(app: &AppHandle) -> PathBuf {
    cache_dir(app).join("manifest.json")
}

fn load_manifest(app: &AppHandle) -> CacheManifest {
    let path = manifest_path(app);
    if path.exists() {
        let data = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        CacheManifest::default()
    }
}

fn save_manifest(app: &AppHandle, manifest: &CacheManifest) -> Result<(), String> {
    let path = manifest_path(app);
    let data = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

pub fn get_cached_path(app: &AppHandle, recording_id: &str) -> Option<PathBuf> {
    if !is_valid_recording_id(recording_id) {
        return None;
    }
    let manifest = load_manifest(app);
    let entry = manifest.entries.get(recording_id)?;
    let path = cache_dir(app).join(&entry.file_name);
    if path.exists() {
        Some(path)
    } else {
        None
    }
}

pub async fn download_and_cache(
    app: &AppHandle,
    url: &str,
    recording_id: &str,
) -> Result<PathBuf, String> {
    if !is_valid_recording_id(recording_id) {
        return Err(format!("Invalid recording_id: {}", recording_id));
    }
    let dir = cache_dir(app);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;

    // Determine file extension from URL
    let ext = url
        .split('?')
        .next()
        .and_then(|p| p.rsplit('.').next())
        .filter(|e| ["m4a", "mp3", "wav", "ogg", "flac", "aac", "mp4"].contains(e))
        .unwrap_or("m4a");

    let file_name = format!("{}.{}", recording_id, ext);
    let file_path = dir.join(&file_name);

    // Download
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download returned status {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let size_bytes = bytes.len() as u64;

    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| format!("Failed to create cache file: {}", e))?;
    file.write_all(&bytes)
        .await
        .map_err(|e| format!("Failed to write cache file: {}", e))?;
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush cache file: {}", e))?;

    // Update manifest
    let mut manifest = load_manifest(app);
    manifest.entries.insert(
        recording_id.to_string(),
        CacheEntry {
            file_name,
            size_bytes,
        },
    );
    save_manifest(app, &manifest)?;

    log::info!(
        "Cached audio for {} ({} bytes) at {:?}",
        recording_id,
        size_bytes,
        file_path
    );

    Ok(file_path)
}

#[derive(Serialize)]
pub struct CacheStatus {
    pub total_files: usize,
    pub total_bytes: u64,
    pub entries: Vec<CacheStatusEntry>,
}

#[derive(Serialize)]
pub struct CacheStatusEntry {
    pub recording_id: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub async fn cmd_cache_status(app: AppHandle) -> Result<CacheStatus, String> {
    let manifest = load_manifest(&app);
    let entries: Vec<CacheStatusEntry> = manifest
        .entries
        .iter()
        .map(|(id, e)| CacheStatusEntry {
            recording_id: id.clone(),
            size_bytes: e.size_bytes,
        })
        .collect();
    let total_bytes = entries.iter().map(|e| e.size_bytes).sum();
    Ok(CacheStatus {
        total_files: entries.len(),
        total_bytes,
        entries,
    })
}

#[tauri::command]
pub async fn cmd_cache_clear(app: AppHandle) -> Result<(), String> {
    let dir = cache_dir(&app);
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
    }
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    save_manifest(&app, &CacheManifest::default())?;
    log::info!("Audio cache cleared");
    Ok(())
}
