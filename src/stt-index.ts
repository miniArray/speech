#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { createAudioRecorder } from "./stt/audio.js";
import { ElevenLabsTranscriber } from "./stt/transcription.js";
import * as readline from "readline";

type RecordingMode = "manual";

type CLIOptions = {
  mode: RecordingMode;
  model?: string;
  language?: string;
  output?: string;
  json?: boolean;
  timestamps?: boolean;
};

let spinner: Ora | null = null;
let isRecording = false;
let currentMode: RecordingMode = "vad";

function setupSignalHandlers(cleanup: () => void): void {
  process.on("SIGINT", () => {
    if (spinner) spinner.stop();
    console.error(chalk.yellow("\n\nShutting down gracefully..."));
    cleanup();
    setTimeout(() => process.exit(0), 500);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}


async function recordManual(
  transcriber: ElevenLabsTranscriber,
  options: CLIOptions
): Promise<void> {
  console.error(
    chalk.cyan("\n💡 Press Enter to stop recording and transcribe.\n")
  );

  spinner = ora({
    text: chalk.green("🎤 Recording..."),
    stream: process.stderr,
  }).start();

  // Create recorder (starts immediately)
  const recorder = createAudioRecorder({
    sampleRate: 16000,
    channels: 1,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  const cleanup = () => {
    rl.close();
  };

  setupSignalHandlers(cleanup);

  rl.on("line", async () => {
    if (spinner) spinner.text = chalk.yellow("Finishing recording...");

    // Wait for audio buffers to drain before stopping
    // This ensures audio in the pipeline reaches SOX
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (spinner) spinner.text = chalk.yellow("Processing...");

    try {
      // Stop recorder and get all audio data
      const audioBuffer = await recorder.stop();

      // Debug: Log buffer size
      console.error(chalk.gray(`\nCaptured ${audioBuffer.length} bytes of audio`));

      // Debug: Save raw audio for inspection
      const debugPath = `/tmp/stt-debug-${Date.now()}.raw`;
      require("fs").writeFileSync(debugPath, audioBuffer);
      console.error(chalk.gray(`Raw audio saved to: ${debugPath}`));

      const result = await transcriber.transcribeWithRetry(audioBuffer);

      if (spinner) spinner.succeed(chalk.green("✓ Transcription complete"));

      // Debug: Show what we got
      console.error(chalk.gray(`Transcription result: "${result.text}"`));
      console.error(chalk.gray(`Text length: ${result.text?.length || 0} characters`));

      if (options.json) {
        console.log(JSON.stringify({ text: result.text }, null, 2));
      } else {
        // Output to stdout (not stderr)
        if (result.text && result.text.trim()) {
          console.log(result.text);
        } else {
          console.error(chalk.yellow("⚠️  No transcription returned (audio may be too short)"));
        }
      }

      process.exit(0);
    } catch (error) {
      if (spinner) spinner.fail(chalk.red("Transcription failed"));
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("stt")
    .description("Speech-to-text CLI with VAD and ElevenLabs")
    .version("1.0.0")
    .option(
      "-m, --mode <type>",
      "Recording mode (only manual supported currently)",
      "manual"
    )
    .option("--model <id>", "ElevenLabs model ID", "scribe_v1")
    .option("--language <code>", "Language code (e.g., en, es, fr)")
    .option("-o, --output <file>", "Output file for transcription")
    .option("--json", "Output as JSON")
    .option("--timestamps", "Include word timestamps (if available)")
    .action(async (options: CLIOptions) => {
      try {
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!apiKey) {
          console.error(
            chalk.red("Error: ELEVENLABS_API_KEY environment variable not set")
          );
          process.exit(1);
        }

        const transcriber = new ElevenLabsTranscriber({
          apiKey,
          model: options.model,
          language: options.language,
        });

        currentMode = options.mode;
        await recordManual(transcriber, options);
      } catch (error) {
        if (spinner) spinner.fail(chalk.red("Failed to start"));
        console.error(
          chalk.red("Error:"),
          error instanceof Error ? error.message : error
        );
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
