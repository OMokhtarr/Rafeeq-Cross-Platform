/**
 * Quiz range pre-fill.
 *
 * When the user starts a quiz from a completed Hifz session, the session's page
 * range is carried through the URL (?fromPage=&toPage=) into the quiz list and
 * on to whichever setup page is chosen. The setup pages use this helper to read
 * that range and open directly in "page" scope with the range filled in.
 */

export interface QuizPrefillRange {
  fromPage: number;
  toPage: number;
}

/** Parse a from/to page range from a URL query string, if both are valid. */
export function readQuizPrefill(search: string): QuizPrefillRange | null {
  const params = new URLSearchParams(search);
  const from = parseInt(params.get("fromPage") || "", 10);
  const to = parseInt(params.get("toPage") || "", 10);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from < 1 || to < from) return null;
  return { fromPage: from, toPage: to };
}

/** Build the `?fromPage=&toPage=` query string (with leading `?`) for a range. */
export function quizPrefillQuery(range: QuizPrefillRange): string {
  return `?fromPage=${range.fromPage}&toPage=${range.toPage}`;
}
