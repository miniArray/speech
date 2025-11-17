import { spawn, type ChildProcess } from "child_process";
import { writeFileSync } from "fs";

export type RecordingMode = "manual" | "vad";

export type AudioRecorderOptions = {
  sampleRate?: number;
  channels?: number;
};

export type AudioRecorder = {
  stop: () => Promise<Buffer>;
};

export function createAudioRecorder(
  options: AudioRecorderOptions = {}
): AudioRecorder {
  const sampleRate = options.sampleRate || 16000;
  const channels = options.channels || 1;

  const chunks: Buffer[] = [];
  let process: ChildProcess | null = null;
  let recordingStarted = false;

  // Start SOX recording immediately
  // rec: Record audio
  // -t raw: Output raw PCM
  // -b 16: 16-bit samples
  // -e signed-integer: Signed PCM
  // -c 1: Mono
  // -r 16000: Sample rate
  // -: Output to stdout
  process = spawn("rec", [
    "-t", "raw",
    "-b", "16",
    "-e", "signed-integer",
    "-c", channels.toString(),
    "-r", sampleRate.toString(),
    "-",
  ]);

  if (!process.stdout) {
    throw new Error("Failed to start recording: no stdout");
  }

  // Collect audio data from stdout
  process.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    recordingStarted = true;
  });

  // Handle errors
  process.stderr?.on("data", (data) => {
    // SOX outputs info to stderr, ignore unless it's an error
    const msg = data.toString();
    if (msg.includes("FAIL") || msg.includes("ERROR")) {
      console.error("SOX error:", msg);
    }
  });

  return {
    stop: async (): Promise<Buffer> => {
      if (!process) {
        throw new Error("Recording not started");
      }

      return new Promise((resolve, reject) => {
        if (!process) {
          reject(new Error("Process is null"));
          return;
        }

        // Send SIGTERM to stop recording
        process.kill("SIGTERM");

        process.on("close", (code) => {
          if (!recordingStarted || chunks.length === 0) {
            reject(new Error("No audio data captured"));
            return;
          }

          resolve(Buffer.concat(chunks));
        });

        process.on("error", reject);

        // Timeout after 2 seconds
        setTimeout(() => {
          if (process && !process.killed) {
            process.kill("SIGKILL");
            reject(new Error("Recording stop timeout"));
          }
        }, 2000);
      });
    },
  };
}

export function saveAudioBuffer(buffer: Buffer, filepath: string): void {
  writeFileSync(filepath, buffer);
}
