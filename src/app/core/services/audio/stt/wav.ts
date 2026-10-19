/**
 * WAV ENCODER
 *
 * Wraps mono Float32 samples in a 44-byte RIFF/WAVE header (PCM, 16-bit)
 * so a captured speech segment can be uploaded to a file-based
 * transcription endpoint.
 */

import { floatToPcm16 } from "./pcm-capture";

const HEADER_BYTES = 44;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const pcm = floatToPcm16(samples);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(HEADER_BYTES + i * 2, pcm[i], true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
