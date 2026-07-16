/**
 * FEEDBACK BEEP
 *
 * Tiny WebAudio helper for quiz answer feedback. Avoids shipping audio
 * assets while still respecting the `soundEffects` setting.
 *  - correct: short ascending two-tone (G5 → C6)
 *  - wrong:   short descending tone  (A4 → E4)
 *  - start:   soft rising two-tone (A4 → E5) — "we started listening"
 *  - stop:    soft descending two-tone (E5 → A4) — "we stopped listening"
 */

import { useCallback, useRef } from "react";

type Tone = "correct" | "wrong" | "start" | "stop";

export function useFeedbackBeep() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = W.AudioContext ?? W.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    return ctxRef.current;
  };

  return useCallback((tone: Tone) => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    const seq: Array<{ f: number; t: number; d: number }> =
      tone === "correct"
        ? [
            { f: 784, t: 0, d: 0.12 }, // G5
            { f: 1046, t: 0.12, d: 0.18 }, // C6
          ]
        : tone === "start"
          ? [
              { f: 440, t: 0, d: 0.12 }, // A4
              { f: 659, t: 0.12, d: 0.2 }, // E5
            ]
          : tone === "stop"
            ? [
                { f: 659, t: 0, d: 0.12 }, // E5
                { f: 440, t: 0.12, d: 0.2 }, // A4
              ]
            : [
                { f: 440, t: 0, d: 0.12 }, // A4
                { f: 330, t: 0.12, d: 0.18 }, // E4
              ];

    for (const note of seq) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.f;
      gain.gain.setValueAtTime(0.0001, now + note.t);
      gain.gain.exponentialRampToValueAtTime(0.18, now + note.t + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.t + note.d,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.02);
    }
  }, []);
}
