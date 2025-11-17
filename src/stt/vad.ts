import { MicVAD, defaultRealTimeSpeechOptions } from "@ricky0123/vad-node";
import type { RealTimeVADOptions } from "@ricky0123/vad-node";

export type VADOptions = {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => Promise<void>;
  onVADMisfire?: () => void;
  positiveSpeechThreshold?: number;
  negativeSpeechThreshold?: number;
  redemptionFrames?: number;
  minSpeechFrames?: number;
};

export type VADInstance = {
  start: () => Promise<void>;
  pause: () => void;
  destroy: () => void;
};

export async function createVAD(options: VADOptions): Promise<VADInstance> {
  const vadOptions: Partial<RealTimeVADOptions> = {
    ...defaultRealTimeSpeechOptions,
    onSpeechStart: options.onSpeechStart,
    onSpeechEnd: options.onSpeechEnd,
    onVADMisfire: options.onVADMisfire,
    positiveSpeechThreshold: options.positiveSpeechThreshold ?? 0.5,
    negativeSpeechThreshold: options.negativeSpeechThreshold ?? 0.35,
    redemptionFrames: options.redemptionFrames ?? 8,
    minSpeechFrames: options.minSpeechFrames ?? 3,
  };

  const vad = await MicVAD.new(vadOptions);

  return {
    start: async () => {
      vad.start();
    },
    pause: () => {
      vad.pause();
    },
    destroy: () => {
      vad.destroy();
    },
  };
}

export function float32ToBuffer(float32Array: Float32Array): Buffer {
  const buffer = Buffer.allocUnsafe(float32Array.length * 2);

  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    buffer.writeInt16LE(int16, i * 2);
  }

  return buffer;
}
