import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdtemp, access } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static");
    if (p) return p;
  } catch { /* ignore */ }
  return "ffmpeg";
}

const ffmpegPath = resolveFfmpegPath();

function isALAC(bytes: Uint8Array): boolean {
  const searchLen = Math.min(bytes.length, 500000);
  for (let i = 0; i < searchLen - 3; i++) {
    if (bytes[i] === 0x61 && bytes[i+1] === 0x6c && bytes[i+2] === 0x61 && bytes[i+3] === 0x63) {
      return true;
    }
  }
  return false;
}

async function transcodeToAAC(inputBuffer: ArrayBuffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "audio-"));
  const inputPath = join(dir, "input.m4a");
  const outputPath = join(dir, "output.m4a");

  try {
    await writeFile(inputPath, Buffer.from(inputBuffer));
    await access(ffmpegPath).catch(() => {
      throw new Error(`ffmpeg not found at: ${ffmpegPath}`);
    });

    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        ["-i", inputPath, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-y", outputPath],
        { timeout: 120000 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error("[TRANSCODE] ffmpeg error:", error.message, stderr);
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

interface RecordingRow {
  file_name: string;
  aac_file_name: string | null;
  audio_codec: string | null;
  waveform_peaks: number[][] | null;
}

const RECORDING_COLUMNS = "file_name, aac_file_name, audio_codec, waveform_peaks";

async function resolveRecording(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select(RECORDING_COLUMNS)
    .eq("id", id)
    .single();

  if (data) return { recording: data as RecordingRow, client: supabase, owned: true };

  // Fallback for shared recordings
  const anonClient = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: shared } = await anonClient
    .from("recordings")
    .select(RECORDING_COLUMNS)
    .eq("id", id)
    .or("share_token.not.is.null,is_featured.eq.true")
    .single();

  if (shared) return { recording: shared as RecordingRow, client: anonClient, owned: false };

  // Fallback for recordings attached to shared journeys
  const { data: journeyRef } = await anonClient
    .from("journeys")
    .select("recording_id")
    .eq("recording_id", id)
    .not("share_token", "is", null)
    .limit(1)
    .maybeSingle();

  if (journeyRef) {
    const { data: journeyRec } = await anonClient
      .from("recordings")
      .select(RECORDING_COLUMNS)
      .eq("id", id)
      .single();
    if (journeyRec) return { recording: journeyRec as RecordingRow, client: anonClient, owned: false };
  }

  return null;
}

export const maxDuration = 120; // Allow up to 120s for large file transcoding

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await resolveRecording(id);

  if (!result) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { recording, client } = result;

  // Check query param to know if client needs transcoded version
  const needsTranscode = request.nextUrl.searchParams.get("transcode") === "1";

  if (!needsTranscode) {
    // If a persisted AAC transcode exists, serve that instead of the original
    const fileToSign = recording.aac_file_name ?? recording.file_name;

    const { data: signedData } = await client.storage
      .from("recordings")
      .createSignedUrl(fileToSign, 3600);

    if (signedData?.signedUrl) {
      return NextResponse.json({
        url: signedData.signedUrl,
        codec: recording.aac_file_name ? "aac" : (recording.audio_codec ?? null),
        hasAac: !!recording.aac_file_name,
      });
    }
  }

  // Transcode path: download, detect ALAC, transcode if needed, stream back
  const { data: fileData, error: dlError } = await client.storage
    .from("recordings")
    .download(recording.file_name);

  if (dlError || !fileData) {
    return NextResponse.json({ error: `Download failed: ${dlError?.message}` }, { status: 500 });
  }

  let arrayBuffer = await fileData.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (isALAC(bytes)) {
    try {
      const transcoded = await transcodeToAAC(arrayBuffer);
      arrayBuffer = transcoded.buffer.slice(
        transcoded.byteOffset,
        transcoded.byteOffset + transcoded.byteLength
      ) as ArrayBuffer;

      // Step 2: Persist the AAC transcode in background (don't block the response)
      const aacFileName = recording.file_name.replace(/\.[^/.]+$/, "") + "_aac.m4a";
      const supabase = await createClient();
      supabase.storage
        .from("recordings")
        .upload(aacFileName, Buffer.from(arrayBuffer), {
          contentType: "audio/mp4",
          upsert: true,
        })
        .then(({ error: uploadErr }) => {
          if (uploadErr) {
            console.error("[AUDIO] Failed to persist AAC:", uploadErr.message);
            return;
          }
          supabase
            .from("recordings")
            .update({ aac_file_name: aacFileName })
            .eq("id", id)
            .then(({ error: dbErr }) => {
              if (dbErr) console.error("[AUDIO] Failed to save aac_file_name:", dbErr.message);
              // Persisted; no log in prod.
            });
        });
    } catch (err) {
      console.error("[AUDIO] Transcoding failed:", err);
      // Return the raw file anyway — Safari can play ALAC
    }
  }

  const range = request.headers.get("range");
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : arrayBuffer.byteLength - 1;
    const chunk = arrayBuffer.slice(start, end + 1);

    return new NextResponse(chunk, {
      status: 206,
      headers: {
        "Content-Type": "audio/mp4",
        "Content-Range": `bytes ${start}-${end}/${arrayBuffer.byteLength}`,
        "Content-Length": String(chunk.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "audio/mp4",
      "Content-Length": String(arrayBuffer.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// WaveSurfer's exportPeaks() returns number[][] shaped as
// [channel0[sample...], channel1[sample...]] — outer = channels (1 mono, 2 stereo),
// inner = amplitude samples in roughly [-1, 1]. Clients currently pass
// maxLength:1000 so inner arrays are ~1000 long.
const MAX_PEAK_CHANNELS = 8;
const MAX_PEAK_SAMPLES = 16384;

function isValidWaveformPeaks(peaks: unknown): peaks is number[][] {
  if (!Array.isArray(peaks)) return false;
  if (peaks.length === 0 || peaks.length > MAX_PEAK_CHANNELS) return false;
  for (const channel of peaks) {
    if (!Array.isArray(channel)) return false;
    if (channel.length === 0 || channel.length > MAX_PEAK_SAMPLES) return false;
    for (const v of channel) {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
      // Allow a small overshoot — some codecs round past exact 1.0 after normalization.
      if (v < -1.5 || v > 1.5) return false;
    }
  }
  return true;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: recording } = await supabase
    .from("recordings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const body = await request.json();

  if (body.waveform_peaks) {
    if (!isValidWaveformPeaks(body.waveform_peaks)) {
      return NextResponse.json(
        { error: "Invalid waveform_peaks: expected array of [number, number] pairs in [-1, 1]" },
        { status: 400 }
      );
    }
    const updates: Record<string, unknown> = { waveform_peaks: body.waveform_peaks };
    if (typeof body.duration === "number" && body.duration > 0 && body.duration < 86400) {
      updates.duration = body.duration;
    }

    const { error } = await supabase
      .from("recordings")
      .update(updates)
      .eq("id", id);

    if (error) {
      console.error("waveform update failed:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "No valid field to update" }, { status: 400 });
}
