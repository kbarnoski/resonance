pub mod fft;
pub mod playback;
pub mod tapped_source;

use crate::cache;
use fft::AudioDataPayload;
use playback::AudioCommand;
use ringbuf::traits::Split;
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::Emitter;

/// Shared playback state accessible from Tauri commands.
pub struct AudioEngine {
    cmd_tx: crossbeam_channel::Sender<AudioCommand>,
    is_playing: Arc<AtomicBool>,
    samples_played: Arc<AtomicU64>,
    sample_rate: Arc<AtomicU64>,
    channels: Arc<AtomicU64>,
    duration_secs: Arc<parking_lot::Mutex<f64>>,
    fft_stop: Arc<AtomicBool>,
    /// Consumer sender — kept alive to hand new consumers to the FFT thread
    fft_consumer_tx: parking_lot::Mutex<Option<crossbeam_channel::Sender<ringbuf::HeapCons<f32>>>>,
}

impl AudioEngine {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let is_playing = Arc::new(AtomicBool::new(false));
        let samples_played = Arc::new(AtomicU64::new(0));
        let sample_rate = Arc::new(AtomicU64::new(44100));
        let channels = Arc::new(AtomicU64::new(2));
        let duration_secs = Arc::new(parking_lot::Mutex::new(0.0));
        let fft_stop = Arc::new(AtomicBool::new(false));

        let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded();

        // "Track ended" callback — emits event to WebView
        let is_playing_clone = is_playing.clone();
        let app_clone = app_handle.clone();
        let on_ended: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
            is_playing_clone.store(false, Ordering::Relaxed);
            let _ = app_clone.emit("native-audio-ended", ());
        });

        // Spawn audio playback thread
        let is_playing_pb = is_playing.clone();
        std::thread::Builder::new()
            .name("audio-playback".into())
            .spawn(move || {
                playback::run_playback_thread(cmd_rx, is_playing_pb, on_ended);
            })
            .expect("Failed to spawn audio playback thread");

        AudioEngine {
            cmd_tx,
            is_playing,
            samples_played,
            sample_rate,
            channels,
            duration_secs,
            fft_stop,
            fft_consumer_tx: parking_lot::Mutex::new(None),
        }
    }

    fn send_cmd(&self, cmd: AudioCommand) -> Result<(), String> {
        self.cmd_tx
            .send(cmd)
            .map_err(|_| "Audio thread disconnected".to_string())
    }
}

// ─── Tauri Commands ───

/// Hostnames the desktop app will download audio from. Anything else
/// is rejected — closes a "supply arbitrary URL → we download and
/// write to disk" hole. Includes Supabase storage (where signed URLs
/// live), our own hosting, and localhost for dev.
///
/// Implemented with string parsing (no `url` crate dep) so this stays
/// minimal. Reqwest is what actually fetches the URL; if we let
/// something pathological through here, reqwest's parser would
/// reject it. This check is the auth layer above that.
fn is_allowed_audio_host(url: &str) -> bool {
    // Strip scheme.
    let without_scheme = if let Some(rest) = url.strip_prefix("https://") {
        rest
    } else if let Some(rest) = url.strip_prefix("http://") {
        rest
    } else {
        return false;
    };
    // Host runs from start to first '/' or '?' or end-of-string.
    let host_end = without_scheme
        .find(|c: char| c == '/' || c == '?' || c == '#')
        .unwrap_or(without_scheme.len());
    let mut host_part = &without_scheme[..host_end];
    // Strip port if present (host:port).
    if let Some(colon) = host_part.find(':') {
        host_part = &host_part[..colon];
    }
    if host_part.is_empty() {
        return false;
    }
    // Reject empty labels (e.g. "..supabase.co") and leading dots —
    // ends_with(".supabase.co") would otherwise pass on ".supabase.co".
    if host_part.starts_with('.') || host_part.contains("..") {
        return false;
    }
    host_part.ends_with(".supabase.co")
        || host_part == "getresonance.vercel.app"
        || host_part == "localhost"
        || host_part == "127.0.0.1"
}

#[tauri::command]
pub async fn cmd_audio_load(
    app: tauri::AppHandle,
    engine: tauri::State<'_, AudioEngine>,
    url: String,
    recording_id: String,
) -> Result<(), String> {
    if !is_allowed_audio_host(&url) {
        return Err(format!("URL host not on allowlist: {}", url));
    }
    // Check cache first
    let file_path = if let Some(cached) = cache::get_cached_path(&app, &recording_id) {
        log::info!("Cache hit for {}", recording_id);
        cached
    } else {
        log::info!("Cache miss for {} — downloading", recording_id);
        cache::download_and_cache(&app, &url, &recording_id).await?
    };

    let path_str = file_path
        .to_str()
        .ok_or("Invalid path encoding")?
        .to_string();

    // Create a channel to receive the new ring buffer consumer
    let (consumer_tx, consumer_rx) = crossbeam_channel::bounded(1);

    engine.send_cmd(AudioCommand::Load {
        path: path_str,
        consumer_tx,
        samples_played: engine.samples_played.clone(),
        sample_rate: engine.sample_rate.clone(),
        channels: engine.channels.clone(),
        duration_secs: engine.duration_secs.clone(),
    })?;

    // Receive the new consumer and send it to the FFT thread
    let consumer = consumer_rx
        .recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "Timeout waiting for audio load")?;

    // Send the consumer to the FFT thread if subscribed
    if let Some(ref tx) = *engine.fft_consumer_tx.lock() {
        let _ = tx.send(consumer);
    }

    Ok(())
}

#[tauri::command]
pub fn cmd_audio_play(engine: tauri::State<'_, AudioEngine>) -> Result<(), String> {
    engine.send_cmd(AudioCommand::Play)
}

#[tauri::command]
pub fn cmd_audio_pause(engine: tauri::State<'_, AudioEngine>) -> Result<(), String> {
    engine.send_cmd(AudioCommand::Pause)
}

#[tauri::command]
pub fn cmd_audio_stop(engine: tauri::State<'_, AudioEngine>) -> Result<(), String> {
    engine.send_cmd(AudioCommand::Stop)
}

#[tauri::command]
pub fn cmd_audio_set_volume(
    engine: tauri::State<'_, AudioEngine>,
    volume: f32,
) -> Result<(), String> {
    engine.send_cmd(AudioCommand::SetVolume(volume))
}

#[tauri::command]
pub fn cmd_audio_seek(engine: tauri::State<'_, AudioEngine>, position: f64) -> Result<(), String> {
    let (consumer_tx, consumer_rx) = crossbeam_channel::bounded(1);

    engine.send_cmd(AudioCommand::Seek {
        position_secs: position,
        samples_played: engine.samples_played.clone(),
        sample_rate: engine.sample_rate.clone(),
        channels: engine.channels.clone(),
        duration_secs: engine.duration_secs.clone(),
        consumer_tx,
    })?;

    // Update FFT consumer
    let consumer = consumer_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Timeout waiting for seek")?;

    if let Some(ref tx) = *engine.fft_consumer_tx.lock() {
        let _ = tx.send(consumer);
    }

    Ok(())
}

#[tauri::command]
pub fn cmd_audio_subscribe(
    engine: tauri::State<'_, AudioEngine>,
    channel: Channel<AudioDataPayload>,
) -> Result<(), String> {
    // Stop any existing FFT thread
    engine.fft_stop.store(true, Ordering::Relaxed);
    std::thread::sleep(std::time::Duration::from_millis(50));

    engine.fft_stop.store(false, Ordering::Relaxed);

    // Create a channel for sending new consumers to the FFT thread
    let (consumer_tx, consumer_rx) = crossbeam_channel::unbounded();
    *engine.fft_consumer_tx.lock() = Some(consumer_tx);

    // Start with an empty consumer
    let initial_rb = HeapRb::<f32>::new(8192);
    let (_, initial_consumer) = initial_rb.split();

    let samples_played = engine.samples_played.clone();
    let sample_rate = engine.sample_rate.clone();
    let duration_secs = engine.duration_secs.clone();
    let is_playing = engine.is_playing.clone();
    let stop_signal = engine.fft_stop.clone();
    let channels = engine.channels.clone();

    std::thread::Builder::new()
        .name("audio-fft".into())
        .spawn(move || {
            let mut current_consumer = initial_consumer;

            loop {
                if stop_signal.load(Ordering::Relaxed) {
                    break;
                }

                // Check for a new consumer (from load or seek)
                if let Ok(new_consumer) = consumer_rx.try_recv() {
                    current_consumer = new_consumer;
                }

                // Run one FFT iteration
                fft::run_fft_thread(
                    current_consumer,
                    channel.clone(),
                    samples_played.clone(),
                    sample_rate.clone(),
                    duration_secs.clone(),
                    is_playing.clone(),
                    stop_signal.clone(),
                    channels.clone(),
                );

                // If run_fft_thread returned, it means either stop_signal or channel closed
                break;
            }
        })
        .map_err(|e| format!("Failed to spawn FFT thread: {}", e))?;

    Ok(())
}
