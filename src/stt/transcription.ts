import { spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export type TranscriptionProvider = "whisper" | "elevenlabs";

export type TranscriptionOptions = {
  provider?: TranscriptionProvider;
  model?: string;
  language?: string;
  modelPath?: string;
  apiKey?: string;
};

export type TranscriptionResult = {
  text: string;
  confidence?: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
};

function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const fileSize = headerSize + dataSize - 8;

  const wavHeader = Buffer.alloc(headerSize);

  // RIFF header
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(fileSize, 4);
  wavHeader.write('WAVE', 8);

  // fmt chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // fmt chunk size
  wavHeader.writeUInt16LE(1, 20); // audio format (1 = PCM)
  wavHeader.writeUInt16LE(channels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(dataSize, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

class WhisperProvider {
  private modelPath: string;
  private language?: string;

  constructor(options: TranscriptionOptions = {}) {
    const homeDir = process.env.HOME || "~";
    this.modelPath = options.modelPath ||
      process.env.WHISPER_MODEL_PATH ||
      `${homeDir}/.local/share/whisper/models/ggml-tiny.en.bin`;
    this.language = options.language || "en";
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const wavBuffer = pcmToWav(audioBuffer, 16000, 1);
    const tempFile = join(tmpdir(), `whisper-${Date.now()}.wav`);
    writeFileSync(tempFile, wavBuffer);

    try {
      return await this.runWhisper(tempFile);
    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  private async runWhisper(audioFile: string): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const args = [
        "-m", this.modelPath,
        "-f", audioFile,
        "-nt",  // No timestamps
        "-l", this.language || "en",
      ];

      const process = spawn("whisper-cpp", args);
      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper failed with code ${code}: ${stderr}`));
          return;
        }

        const lines = stdout.split("\n");
        const textLines = lines
          .filter(line => !line.startsWith("[") && line.trim().length > 0)
          .map(line => line.trim());
        const text = textLines.join(" ").trim();

        resolve({ text });
      });

      process.on("error", (error) => {
        reject(new Error(`Failed to run whisper: ${error.message}`));
      });
    });
  }
}

class ElevenLabsProvider {
  private apiKey: string;
  private model: string;
  private language?: string;

  constructor(options: TranscriptionOptions) {
    if (!options.apiKey) {
      throw new Error("ElevenLabs provider requires apiKey");
    }
    this.apiKey = options.apiKey;
    this.model = options.model || "scribe_v1";
    this.language = options.language;
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    const { ElevenLabsClient } = await import("elevenlabs");
    const client = new ElevenLabsClient({ apiKey: this.apiKey });

    const wavBuffer = pcmToWav(audioBuffer, 16000, 1);
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    const file = new File([blob], "audio.wav", { type: "audio/wav" });

    const result = await client.speechToText.convert({
      file,
      modelId: this.model,
      ...(this.language && { language: this.language }),
    });

    return { text: result.text };
  }
}

export class Transcriber {
  private provider: WhisperProvider | ElevenLabsProvider;

  constructor(options: TranscriptionOptions = {}) {
    const providerType = options.provider || "whisper";

    if (providerType === "elevenlabs") {
      this.provider = new ElevenLabsProvider(options);
    } else {
      this.provider = new WhisperProvider(options);
    }
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    return this.provider.transcribe(audioBuffer);
  }

  async transcribeWithRetry(
    audioBuffer: Buffer,
    maxRetries: number = 2
  ): Promise<TranscriptionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.transcribe(audioBuffer);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    throw new Error(
      `Failed after ${maxRetries} attempts: ${lastError?.message}`
    );
  }
}

// Legacy export for backwards compatibility
export const WhisperTranscriber = Transcriber;
