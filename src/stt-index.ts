#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { createAudioRecorder, type AudioRecorder } from "./stt/audio.js";
import {
  Transcriber,
  type TranscriptionProvider,
} from "./stt/transcription.js";
import * as readline from "readline";

type RecordingMode = "manual";

type CLIOptions = {
  mode: RecordingMode;
  provider?: TranscriptionProvider;
  model?: string;
  language?: string;
  output?: string;
  json?: boolean;
  timestamps?: boolean;
  quiet?: boolean;
};

let spinner: Ora | null = null;
let isRecording = false;
let currentMode: RecordingMode = "manual";

// Global state for signal handling
let activeRecorder: AudioRecorder | null = null;
let activeTranscriber: Transcriber | null = null;
let activeOptions: CLIOptions | null = null;
let isProcessingSignal = false;

// Quiet mode: auto-detect when not in TTY (for piping to wtype, etc.)
const isQuietMode = (): boolean => !process.stdin.isTTY;

async function handleSignalTranscription(): Promise<void> {
  if (isProcessingSignal || !activeRecorder || !activeTranscriber) {
    process.exit(0);
    return;
  }

  isProcessingSignal = true;
  const quiet = isQuietMode();

  if (spinner) spinner.stop();
  if (!quiet) {
    console.error(chalk.yellow("\nStopping recording..."));
  }

  try {
    // Wait for audio buffers to drain before stopping
    // Ensures we capture all speech without cutting off
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const audioBuffer = await activeRecorder.stop();
    const result = await activeTranscriber.transcribeWithRetry(audioBuffer);

    if (result.text && result.text.trim()) {
      if (activeOptions?.json) {
        console.log(JSON.stringify({ text: result.text }, null, 2));
      } else {
        console.log(result.text);
      }
    }
    process.exit(0);
  } catch (error) {
    if (!quiet) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
    }
    process.exit(1);
  }
}

function setupSignalHandlers(cleanup: () => void): void {
  process.on("SIGINT", () => {
    handleSignalTranscription();
  });

  process.on("SIGTERM", () => {
    handleSignalTranscription();
  });
}

async function recordManual(
  transcriber: Transcriber,
  options: CLIOptions,
): Promise<void> {
  const quiet = isQuietMode();

  // Store global state for signal handlers
  activeTranscriber = transcriber;
  activeOptions = options;

  if (!quiet) {
    console.error(
      chalk.cyan("\n💡 Press Enter or Ctrl+C to stop recording and transcribe.\n"),
    );

    spinner = ora({
      text: chalk.green("🎤 Recording..."),
      stream: process.stderr,
    }).start();
  }

  // Create recorder (starts immediately)
  const recorder = createAudioRecorder({
    sampleRate: 16000,
    channels: 1,
  });

  // Store recorder for signal handlers
  activeRecorder = recorder;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const cleanup = () => {
    rl.close();
  };

  setupSignalHandlers(cleanup);

  rl.on("line", async () => {
    if (spinner) spinner.text = chalk.yellow("Processing...");

    // Wait for audio buffers to drain before stopping
    // 1 second ensures we capture all speech without cutting off
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      // Stop recorder and get all audio data
      const audioBuffer = await recorder.stop();

      const result = await transcriber.transcribeWithRetry(audioBuffer);

      if (spinner) spinner.succeed(chalk.green("✓ Transcription complete"));

      if (options.json) {
        console.log(JSON.stringify({ text: result.text }, null, 2));
      } else {
        // Output to stdout (not stderr)
        if (result.text && result.text.trim()) {
          console.log(result.text);
        } else if (!quiet) {
          console.error(
            chalk.yellow(
              "!  No transcription returned (audio may be too short)",
            ),
          );
        }
      }

      process.exit(0);
    } catch (error) {
      if (spinner) spinner.fail(chalk.red("Transcription failed"));
      if (!quiet) {
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
      }
      process.exit(1);
    }
  });
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("stt")
    .description(
      "Speech-to-text CLI with Whisper (local) or ElevenLabs (cloud)",
    )
    .version("1.0.0")
    .option(
      "-p, --provider <type>",
      "Provider: whisper (local, default) or elevenlabs (cloud)",
      "whisper",
    )
    .option(
      "-m, --mode <type>",
      "Recording mode (only manual supported currently)",
      "manual",
    )
    .option("--model <value>", "Model: whisper path or elevenlabs model ID")
    .option("--language <code>", "Language code (e.g., en, es, fr)")
    .option("-o, --output <file>", "Output file for transcription")
    .option("--json", "Output as JSON")
    .option("--timestamps", "Include word timestamps (if available)")
    .action(async (options: CLIOptions) => {
      try {
        const provider = options.provider || "whisper";
        const apiKey = process.env.ELEVENLABS_API_KEY;

        // Check for API key if using ElevenLabs
        if (provider === "elevenlabs" && !apiKey) {
          console.error(
            chalk.red(
              "Error: ELEVENLABS_API_KEY required for ElevenLabs provider",
            ),
          );
          console.error(
            chalk.yellow(
              "Tip: Use --provider whisper for offline transcription",
            ),
          );
          process.exit(1);
        }

        const transcriber = new Transcriber({
          provider,
          modelPath: provider === "whisper" ? options.model : undefined,
          model: provider === "elevenlabs" ? options.model : undefined,
          language: options.language,
          apiKey,
        });

        currentMode = options.mode;
        await recordManual(transcriber, options);
      } catch (error) {
        if (spinner) spinner.fail(chalk.red("Failed to start"));
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
