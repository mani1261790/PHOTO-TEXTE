export const CORRECTION_ANNOTATION_VERSION = 2 as const;

export type CorrectionHighlightKind =
  | "useful_word"
  | "useful_verb"
  | "grammar";

export type TextRange = {
  start: number;
  end: number;
};

export type CorrectionHighlightRange = TextRange & {
  kind: CorrectionHighlightKind;
};

export type CorrectionAnnotations = {
  version: typeof CORRECTION_ANNOTATION_VERSION;
  textSignature: string;
  highlights: CorrectionHighlightRange[];
  knownRanges: TextRange[];
};

export type CorrectionAnnotationSegment = TextRange & {
  text: string;
  highlight: CorrectionHighlightKind | null;
  known: boolean;
};

const highlightKinds = new Set<CorrectionHighlightKind>([
  "useful_word",
  "useful_verb",
  "grammar",
]);

export function getAnnotationTextSignature(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1:${text.length}:${(hash >>> 0).toString(36)}`;
}

export function emptyCorrectionAnnotations(text: string): CorrectionAnnotations {
  return {
    version: CORRECTION_ANNOTATION_VERSION,
    textSignature: getAnnotationTextSignature(text),
    highlights: [],
    knownRanges: [],
  };
}

function normalizeRange(value: unknown, textLength: number): TextRange | null {
  if (!value || typeof value !== "object") return null;
  const range = value as { start?: unknown; end?: unknown };
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) return null;
  const start = range.start as number;
  const end = range.end as number;
  if (start < 0 || end <= start || end > textLength) return null;
  return { start, end };
}

function mergeAdjacentHighlights(
  ranges: CorrectionHighlightRange[],
): CorrectionHighlightRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: CorrectionHighlightRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.kind === range.kind && previous.end === range.start) {
      previous.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function replaceHighlightRange(
  ranges: CorrectionHighlightRange[],
  selection: TextRange,
  kind: CorrectionHighlightKind,
): CorrectionHighlightRange[] {
  const next: CorrectionHighlightRange[] = [];
  for (const range of ranges) {
    if (range.end <= selection.start || range.start >= selection.end) {
      next.push({ ...range });
      continue;
    }
    if (range.start < selection.start) {
      next.push({ ...range, end: selection.start });
    }
    if (range.end > selection.end) {
      next.push({ ...range, start: selection.end });
    }
  }
  next.push({ ...selection, kind });
  return mergeAdjacentHighlights(next);
}

export function removeHighlightRange(
  ranges: CorrectionHighlightRange[],
  selection: TextRange,
): CorrectionHighlightRange[] {
  const next: CorrectionHighlightRange[] = [];
  for (const range of ranges) {
    if (range.end <= selection.start || range.start >= selection.end) {
      next.push({ ...range });
      continue;
    }
    if (range.start < selection.start) next.push({ ...range, end: selection.start });
    if (range.end > selection.end) next.push({ ...range, start: selection.end });
  }
  return mergeAdjacentHighlights(next);
}

export function addKnownRange(ranges: TextRange[], selection: TextRange): TextRange[] {
  let merged = { ...selection };
  const next: TextRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (range.end < merged.start) {
      next.push({ ...range });
    } else if (range.start > merged.end) {
      next.push(merged);
      merged = { ...range };
    } else {
      merged = {
        start: Math.min(merged.start, range.start),
        end: Math.max(merged.end, range.end),
      };
    }
  }
  next.push(merged);
  return next.sort((a, b) => a.start - b.start);
}

export function removeKnownRange(ranges: TextRange[], selection: TextRange): TextRange[] {
  const next: TextRange[] = [];
  for (const range of ranges) {
    if (range.end <= selection.start || range.start >= selection.end) {
      next.push({ ...range });
      continue;
    }
    if (range.start < selection.start) next.push({ ...range, end: selection.start });
    if (range.end > selection.end) next.push({ ...range, start: selection.end });
  }
  return next.sort((a, b) => a.start - b.start);
}

export function trimAnnotationRange(
  text: string,
  start: number,
  end: number,
): TextRange | null {
  let safeStart = Math.max(0, Math.min(start, text.length));
  let safeEnd = Math.max(safeStart, Math.min(end, text.length));
  while (safeStart < safeEnd && /\s/.test(text[safeStart])) safeStart += 1;
  while (safeEnd > safeStart && /\s/.test(text[safeEnd - 1])) safeEnd -= 1;
  return safeEnd > safeStart ? { start: safeStart, end: safeEnd } : null;
}

export function normalizeCorrectionAnnotations(
  input: unknown,
  text: string,
): CorrectionAnnotations {
  const empty = emptyCorrectionAnnotations(text);
  if (!input || typeof input !== "object") return empty;

  const value = input as {
    version?: unknown;
    textSignature?: unknown;
    highlights?: unknown;
    knownRanges?: unknown;
  };
  if (
    value.version !== CORRECTION_ANNOTATION_VERSION ||
    value.textSignature !== empty.textSignature
  ) {
    return empty;
  }

  let highlights: CorrectionHighlightRange[] = [];
  if (Array.isArray(value.highlights)) {
    for (const candidate of value.highlights) {
      const range = normalizeRange(candidate, text.length);
      const kind = (candidate as { kind?: unknown } | null)?.kind;
      if (!range || typeof kind !== "string" || !highlightKinds.has(kind as CorrectionHighlightKind)) {
        continue;
      }
      highlights = replaceHighlightRange(highlights, range, kind as CorrectionHighlightKind);
    }
  }

  let knownRanges: TextRange[] = [];
  if (Array.isArray(value.knownRanges)) {
    for (const candidate of value.knownRanges) {
      const range = normalizeRange(candidate, text.length);
      if (range) knownRanges = addKnownRange(knownRanges, range);
    }
  }

  return { ...empty, highlights, knownRanges };
}

export function buildCorrectionAnnotationSegments(
  text: string,
  annotations: CorrectionAnnotations,
): CorrectionAnnotationSegment[] {
  if (!text) return [];
  const boundaries = new Set<number>([0, text.length]);
  annotations.highlights.forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });
  annotations.knownRanges.forEach((range) => {
    boundaries.add(range.start);
    boundaries.add(range.end);
  });
  const points = [...boundaries].sort((a, b) => a - b);

  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    return {
      start,
      end,
      text: text.slice(start, end),
      highlight:
        annotations.highlights.find((range) => range.start <= start && range.end >= end)?.kind ??
        null,
      known: annotations.knownRanges.some(
        (range) => range.start <= start && range.end >= end,
      ),
    };
  });
}
