import { ElevenLabsClient } from "elevenlabs";
import { Readable } from "stream";

export type TranscriptionOptions = {
  apiKey: string;
  model?: string;
  language?: string;
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

export class ElevenLabsTranscriber {
  private client: ElevenLabsClient;
  private model: string;
  private language?: string;

  constructor(options: TranscriptionOptions) {
    this.client = new ElevenLabsClient({ apiKey: options.apiKey });
    this.model = options.model || "scribe_v1";
    this.language = options.language;
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    try {
      // Convert PCM to WAV format with proper headers
      const wavBuffer = pcmToWav(audioBuffer, 16000, 1);

      // Convert Buffer to Blob for the API
      const blob = new Blob([wavBuffer], { type: "audio/wav" });

      // Create a File from the Blob
      const file = new File([blob], "audio.wav", { type: "audio/wav" });

      const result = await this.client.speechToText.convert({
        file,
        modelId: this.model,
        ...(this.language && { language: this.language }),
      });

      return {
        text: result.text,
        // Add additional fields if available in the response
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Transcription failed: ${error.message}`);
      }
      throw error;
    }
  }

  async transcribeWithRetry(
    audioBuffer: Buffer,
    maxRetries: number = 3
  ): Promise<TranscriptionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.transcribe(audioBuffer);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed after ${maxRetries} attempts: ${lastError?.message}`
    );
  }
}
