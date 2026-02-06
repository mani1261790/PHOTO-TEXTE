import path from 'node:path';

import PptxGenJS from 'pptxgenjs';

import { HighlightToken } from '@/lib/cefr/vocab';
import { Memo } from '@/lib/types';

export interface PptxExportInput {
  titleFr: string;
  draftFr: string;
  jpText: string;
  finalFr: string;
  photoBase64?: string;
  draftHighlights?: HighlightToken[];
  finalHighlights?: HighlightToken[];
  memos?: Memo[];
  includeMemos?: boolean;
}

const template = {
  title: { x: 0.5, y: 0.4, w: 12.3, h: 0.7, fontFace: 'Aptos Display', baseSize: 30 },
  body: { x: 0.7, y: 5.3, w: 12, h: 1.8, fontFace: 'Aptos', baseSize: 22 },
  image: { x: 0.8, y: 1.2, w: 11.8, h: 3.9 }
};

function fitText(value: string, baseSize: number, maxChars: number): { text: string; size: number } {
  const clean = value.trim();
  if (clean.length <= maxChars) {
    return { text: clean, size: baseSize };
  }

  const ratio = maxChars / clean.length;
  const computed = Math.max(14, Math.floor(baseSize * ratio));
  if (computed > 14) {
    return { text: clean, size: computed };
  }

  return { text: `${clean.slice(0, Math.max(0, maxChars - 1))}…`, size: 14 };
}

function highlightedList(tokens: HighlightToken[] = []): string {
  const unique = new Set<string>();
  const lines: string[] = [];

  for (const token of tokens) {
    if (!token.unknown || !token.lemma || !token.meaning) {
      continue;
    }
    const key = `${token.lemma}:${token.meaning}`;
    if (unique.has(key)) {
      continue;
    }
    unique.add(key);
    lines.push(`${token.lemma} - ${token.meaning}`);
  }

  return lines.length ? lines.join('\n') : 'No highlighted unknown words for this CEFR level.';
}

export async function generatePhotoTextePptx(
  data: PptxExportInput
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = 'PHOTO-TEXTE App';
  pptx.subject = 'Student assignment export';
  pptx.title = 'PHOTO-TEXTE Export';
  pptx.company = 'PHOTO-TEXTE';
  pptx.layout = 'LAYOUT_WIDE';

  // Slide 1: draft
  const s1 = pptx.addSlide();
  const title1 = fitText(data.titleFr, template.title.baseSize, 90);
  const draft = fitText(data.draftFr, template.body.baseSize, 620);
  s1.background = { color: 'F9F7F1' };
  s1.addText(title1.text, {
    ...template.title,
    fontFace: template.title.fontFace,
    fontSize: title1.size,
    color: '133C55',
    bold: true
  });
  if (data.photoBase64) {
    s1.addImage({ data: data.photoBase64, ...template.image });
  }
  s1.addText(draft.text, {
    ...template.body,
    fontFace: template.body.fontFace,
    fontSize: draft.size,
    color: '1F2933'
  });

  // Slide 2: JP intent
  const s2 = pptx.addSlide();
  const jp = fitText(data.jpText, template.body.baseSize, 620);
  s2.background = { color: 'F0F4F8' };
  s2.addText(title1.text, {
    ...template.title,
    fontFace: template.title.fontFace,
    fontSize: title1.size,
    color: '0B7285',
    bold: true
  });
  if (data.photoBase64) {
    s2.addImage({ data: data.photoBase64, ...template.image });
  }
  s2.addText(jp.text, {
    ...template.body,
    fontFace: 'Yu Gothic',
    fontSize: jp.size,
    color: '102A43'
  });

  // Slide 3: final FR
  const s3 = pptx.addSlide();
  const finalText = fitText(data.finalFr, template.body.baseSize, 620);
  s3.background = { color: 'F5F2EB' };
  s3.addText(title1.text, {
    ...template.title,
    fontFace: template.title.fontFace,
    fontSize: title1.size,
    color: '3D405B',
    bold: true
  });
  if (data.photoBase64) {
    s3.addImage({ data: data.photoBase64, ...template.image });
  }
  s3.addText(finalText.text, {
    ...template.body,
    fontFace: template.body.fontFace,
    fontSize: finalText.size,
    color: '2D3142'
  });

  // Slide 4: vocab and memo summary
  const s4 = pptx.addSlide();
  s4.background = { color: 'EEF2E6' };
  s4.addText('Vocabulary Highlights', {
    x: 0.6,
    y: 0.5,
    w: 6,
    h: 0.5,
    fontFace: template.title.fontFace,
    fontSize: 24,
    color: '2F5233',
    bold: true
  });
  s4.addText(highlightedList([...(data.draftHighlights || []), ...(data.finalHighlights || [])]), {
    x: 0.8,
    y: 1.2,
    w: 5.8,
    h: 5.5,
    fontFace: 'Aptos',
    fontSize: 16,
    color: '1F2933'
  });

  const memoLines = data.includeMemos
    ? (data.memos ?? []).map((memo) => `(${memo.memo_type}) ${memo.content}`).join('\n\n') || 'No memos.'
    : 'Memos not included.';
  const memoText = fitText(memoLines, 16, 1000);
  s4.addText('Memos', {
    x: 6.8,
    y: 0.5,
    w: 5.8,
    h: 0.5,
    fontFace: template.title.fontFace,
    fontSize: 24,
    color: '2F5233',
    bold: true
  });
  s4.addText(memoText.text, {
    x: 6.9,
    y: 1.2,
    w: 5.6,
    h: 5.5,
    fontFace: 'Aptos',
    fontSize: memoText.size,
    color: '1F2933'
  });

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return buffer;
}

export function templatePath(): string {
  return path.join(process.cwd(), 'templates', 'photo-texte-template.pptx');
}
