/**
 * SNIPPET POSITION MAPPER
 * Migrated from: src/shared/utils/snippetPositionMapper.js
 *
 * Maps quiz snippet positions to on-page character positions.
 * Enables precise highlighting of only the quizzed portion in PageViewer.
 *
 * No logic changes — TypeScript types added only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharRange {
  startChar: number;
  endChar: number;
  found: boolean;
}

export interface TextSegment {
  text: string;
  className: string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Find the starting and ending character indices of a snippet within the full verse text.
 * Original source: snippetPositionMapper.js → findSnippetCharacterRange()
 */
export const findSnippetCharacterRange = (
  fullText: string,
  snippet: string
): CharRange => {
  if (!fullText || !snippet) {
    return { startChar: 0, endChar: 0, found: false };
  }

  const startChar = fullText.indexOf(snippet);
  if (startChar === -1) {
    return findSnippetByWords(fullText, snippet);
  }

  return { startChar, endChar: startChar + snippet.length, found: true };
};

/**
 * Find snippet position by word-level matching (more resilient to diacritic differences).
 * Original source: snippetPositionMapper.js → findSnippetByWords()
 */
const findSnippetByWords = (fullText: string, snippet: string): CharRange => {
  const fullWords = fullText.split(/\s+/).filter((w) => w.length > 0);
  const snippetWords = snippet.split(/\s+/).filter((w) => w.length > 0);

  if (snippetWords.length === 0) {
    return { startChar: 0, endChar: 0, found: false };
  }

  let startWordIdx = -1;
  for (let i = 0; i <= fullWords.length - snippetWords.length; i++) {
    if (fullWords[i] === snippetWords[0]) {
      let matches = true;
      for (let j = 1; j < snippetWords.length; j++) {
        if (fullWords[i + j] !== snippetWords[j]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        startWordIdx = i;
        break;
      }
    }
  }

  if (startWordIdx === -1) {
    return { startChar: 0, endChar: 0, found: false };
  }

  let charCount = 0;
  let startChar = 0;
  let endChar = 0;

  fullWords.forEach((word, idx) => {
    if (idx === startWordIdx) startChar = charCount;
    charCount += word.length;
    if (idx === startWordIdx + snippetWords.length - 1) endChar = charCount;
    charCount += 1; // space
  });

  return { startChar, endChar, found: true };
};

/**
 * Split text into before/snippet/after segments.
 * Original source: snippetPositionMapper.js → splitTextBySnippet()
 */
export const splitTextBySnippet = (
  fullText: string,
  snippet: string
): { before: string; snippet: string; after: string; found: boolean } => {
  const { startChar, endChar, found } = findSnippetCharacterRange(
    fullText,
    snippet
  );

  if (!found) {
    return { before: fullText, snippet: "", after: "", found: false };
  }

  return {
    before: fullText.substring(0, startChar),
    snippet: fullText.substring(startChar, endChar),
    after: fullText.substring(endChar),
    found: true,
  };
};

/**
 * Create CSS-classed segments for rendering highlighted verse text.
 * Original source: snippetPositionMapper.js → createHighlightedSegments()
 */
export const createHighlightedSegments = (
  fullText: string,
  snippet: string
): TextSegment[] => {
  const { before, snippet: snippetText, after, found } = splitTextBySnippet(
    fullText,
    snippet
  );

  if (!found) {
    return [{ text: fullText, className: "verse-text" }];
  }

  const segments: TextSegment[] = [];
  if (before) segments.push({ text: before, className: "verse-text dim-text" });
  if (snippetText)
    segments.push({ text: snippetText, className: "verse-text highlight-snippet" });
  if (after) segments.push({ text: after, className: "verse-text dim-text" });

  return segments;
};

/** Alias — matches original export name */
export const getMaskSegments = createHighlightedSegments;
