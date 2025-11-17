#!/usr/bin/env node

import { ElevenLabsClient } from "elevenlabs";
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

type Options = {
  voice: string;
  output?: string;
  model?: string;
  stability?: number;
  similarity?: number;
};

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => {
      data += chunk;
    });

    process.stdin.on("end", () => {
      resolve(data.trim());
    });

    process.stdin.on("error", reject);
  });
}

async function generateSpeech(text: string, options: Options): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY environment variable is not set");
  }

  const client = new ElevenLabsClient({ apiKey });

  const audioStream = await client.textToSpeech.convert(options.voice, {
    text,
    modelId: options.model || "eleven_multilingual_v2",
    voiceSettings: {
      stability: options.stability ?? 0.5,
      similarityBoost: options.similarity ?? 0.75,
    },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function main() {
  const program = new Command();

  program
    .name("tts")
    .description("Simple ElevenLabs text-to-speech CLI")
    .version("1.0.0")
    .argument("[text]", "Text to convert to speech (if not piped)")
    .option("-v, --voice <id>", "Voice ID to use", "ErXwobaYiN019PkySvjV")
    .option("-o, --output <file>", "Output file (default: stdout)")
    .option("-m, --model <id>", "Model ID", "eleven_multilingual_v2")
    .option("-s, --stability <value>", "Voice stability (0-1)", parseFloat, 0.5)
    .option("-S, --similarity <value>", "Similarity boost (0-1)", parseFloat, 0.75)
    .action(async (textArg: string | undefined, options: Options) => {
      try {
        // Get text from argument or stdin
        let text: string;
        if (textArg) {
          text = textArg;
        } else if (!process.stdin.isTTY) {
          text = await readStdin();
        } else {
          console.error("Error: No text provided. Pipe text or provide as argument.");
          process.exit(1);
        }

        if (!text) {
          console.error("Error: Empty text provided");
          process.exit(1);
        }

        // Generate speech
        const audioBuffer = await generateSpeech(text, options);

        // Output to file or stdout
        if (options.output) {
          const outputPath = path.resolve(options.output);
          fs.writeFileSync(outputPath, audioBuffer);
          console.error(`Audio saved to: ${outputPath}`);
        } else {
          // Write binary data to stdout
          process.stdout.write(audioBuffer);
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

main();
