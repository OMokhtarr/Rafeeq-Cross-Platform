/**
 * LOG TEXT
 *
 * Text a speech server chose (a close reason, an error message) is
 * untrusted: printed raw, a line break in it could forge a whole
 * `[recite-stream]` log line, and its length is unbounded. This folds line
 * breaks to spaces and caps the length before it reaches the console.
 */

const MAX_LOG_TEXT = 120;

export function logText(text: unknown): string {
  return String(text ?? "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, MAX_LOG_TEXT);
}
