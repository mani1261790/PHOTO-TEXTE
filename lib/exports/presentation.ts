import {
  CorrectionAnnotations,
  CorrectionHighlightKind,
  buildCorrectionAnnotationSegments,
} from "@/lib/learning/annotations";

export interface PresentationPhotoInput {
  position: number;
  draftFr: string;
  jpAuto: string;
  jpIntent: string;
  finalFr: string;
  annotations?: CorrectionAnnotations;
  photoBase64?: string;
}

export interface PresentationExportInput {
  titleFr: string;
  displayName?: string;
  photos: PresentationPhotoInput[];
  learningBullets?: string[];
}

export const SLIDE_WIDTH_IN = 13.333;
export const SLIDE_HEIGHT_IN = 7.5;

export const presentationLayout = {
  title: { x: 0.5, y: 0.25, w: 12.3, h: 0.65 },
  textPad: 0.18,
  leftCol: { x: 0.6, y: 1.2, w: 5.9, h: 5.8 },
  rightCol: { x: 6.8, y: 1.2, w: 5.9, h: 5.8 },
  rightTop: { x: 6.8, y: 1.2, w: 5.9, h: 2.75 },
  rightBottom: { x: 6.8, y: 4.25, w: 5.9, h: 2.75 },
  etape5Text: { x: 0.6, y: 1.2, w: 12.1, h: 4.9 },
  etape5Legend: { x: 0.8, y: 6.2, w: 11.8, h: 1.0 },
  learningHeader: { x: 0.6, y: 0.25, w: 12.2, h: 0.8 },
  learningBody: { x: 1.2, y: 1.6, w: 11.4, h: 5.6 },
} as const;

export const presentationColors = {
  background: "F8FAFC",
  ink: "0F172A",
  secondaryInk: "334155",
  mutedInk: "64748B",
  border: "CBD5E1",
  white: "FFFFFF",
} as const;

export const annotationColors: Record<CorrectionHighlightKind, string> = {
  useful_word: "BBF7D0",
  useful_verb: "FED7AA",
  grammar: "FEF08A",
};

export function cleanLinesToBullets(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const parts = value
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) out.push(part.replace(/^[-*•\u2022]+\s*/, ""));
  }
  return out.slice(0, 18);
}

export function fitPresentationText(
  value: string,
  baseSize: number,
  maxChars: number,
  minSize = 10,
): { text: string; size: number } {
  const clean = (value ?? "").trim();
  const lineCount = Math.max(1, clean.split(/\r?\n/).length);
  const effectiveLength = clean.length + (lineCount - 1) * Math.round(maxChars * 0.35);
  if (effectiveLength <= maxChars) return { text: clean || " ", size: baseSize };
  const ratio = maxChars / effectiveLength;
  return {
    text: clean || " ",
    size: Math.max(minSize, Math.floor(baseSize * ratio)),
  };
}

export function computePhotoGrid(n: number): { cols: number; rows: number } {
  if (n <= 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  return { cols: 5, rows: 2 };
}

export type AnnotatedPlacement = {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  line: number;
  highlight: CorrectionHighlightKind | null;
  knownRangeIndex: number;
};

export function estimatePresentationTextWidth(value: string, fontSize: number): number {
  let em = 0;
  for (const character of value) {
    if (/\s/.test(character)) em += 0.28;
    else if (/[mwMWŒœÆæ]/.test(character)) em += 0.78;
    else if (/[ilI1'’.,;:!]/.test(character)) em += 0.28;
    else if (/[A-ZÀ-Ý]/.test(character)) em += 0.62;
    else em += 0.52;
  }
  return Math.max(0.05, (em * fontSize) / 72);
}

export function layoutAnnotatedPlacements(
  text: string,
  annotations: CorrectionAnnotations,
  width: number,
  fontSize: number,
): { placements: AnnotatedPlacement[]; height: number } {
  const segments = buildCorrectionAnnotationSegments(text, annotations);
  const lineHeight = (fontSize * 1.28) / 72;
  const placements: AnnotatedPlacement[] = [];
  let x = 0;
  let line = 0;

  for (const segment of segments) {
    let cursor = segment.start;
    const parts = segment.text.split(/(\r?\n|\s+)/g).filter(Boolean);
    for (const part of parts) {
      const start = cursor;
      const end = start + part.length;
      cursor = end;
      if (/\r?\n/.test(part)) {
        line += 1;
        x = 0;
        continue;
      }
      const partWidth = estimatePresentationTextWidth(part, fontSize);
      if (/^\s+$/.test(part)) {
        x += partWidth;
        continue;
      }
      if (x > 0 && x + partWidth > width) {
        line += 1;
        x = 0;
      }
      placements.push({
        text: part,
        x,
        y: line * lineHeight,
        w: Math.min(partWidth, width),
        h: lineHeight,
        line,
        highlight: segment.highlight,
        knownRangeIndex: annotations.knownRanges.findIndex(
          (range) => range.start <= start && range.end >= end,
        ),
      });
      x += partWidth;
    }
  }

  return { placements, height: (line + 1) * lineHeight };
}
