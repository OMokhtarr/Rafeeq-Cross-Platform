/**
 * PCM CAPTURE
 *
 * Opens the microphone as 16 kHz mono Float32 frames, for speech engines
 * that take raw PCM (Soniox streaming) or WAV segments (Whisper) rather
 * than MediaRecorder's containerized audio.
 */

export const PCM_SAMPLE_RATE = 16000;
export const PCM_FRAME_SAMPLES = 1024;

/** Float [-1, 1] to signed 16-bit PCM, clamping out-of-range input. */
export function floatToPcm16(frame: Float32Array): Int16Array {
  const out = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    const s = Math.max(-1, Math.min(1, frame[i]));
    out[i] = Math.round(s * 32767);
  }
  return out;
}

export async function startPcmCapture(
  onFrame: (frame: Float32Array) => void,
): Promise<{ stop(): void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(PCM_FRAME_SAMPLES, 1, 1);

  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    // The engine reuses its input buffer, so hand out a copy.
    onFrame(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  // ScriptProcessorNode only fires while connected to a destination.
  processor.connect(context.destination);

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      void context.close();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
