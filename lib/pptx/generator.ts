import path from 'node:path';

import PptxGenJS from 'pptxgenjs';

export interface PptxExportInput {
  titleFr: string;
  draftFr: string;
  jpAuto: string;
  jpIntent: string;
  finalFr: string;
  photoBase64?: string;
}

const layout = {
  title: { x: 0.5, y: 0.25, w: 12.3, h: 0.65 },
  leftCol: { x: 0.6, y: 1.2, w: 5.9, h: 5.8 },
  rightCol: { x: 6.8, y: 1.2, w: 5.9, h: 5.8 },
  rightTop: { x: 6.8, y: 1.2, w: 5.9, h: 2.75 },
  rightBottom: { x: 6.8, y: 4.25, w: 5.9, h: 2.75 },
  textPad: 0.18
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

function addSlideTitle(slide: PptxGenJS.Slide, value: string) {
  slide.addText(value, {
    ...layout.title,
    fontFace: 'Aptos Display',
    fontSize: 24,
    bold: true,
    color: '0F172A'
  });
}

function addPhotoOrPlaceholder(slide: PptxGenJS.Slide, data?: string) {
  slide.addShape('rect', {
    x: layout.leftCol.x,
    y: layout.leftCol.y,
    w: layout.leftCol.w,
    h: layout.leftCol.h,
    line: { color: 'CBD5E1', pt: 1 },
    fill: { color: 'F8FAFC' }
  });

  if (data) {
    slide.addImage({
      data,
      x: layout.leftCol.x,
      y: layout.leftCol.y,
      w: layout.leftCol.w,
      h: layout.leftCol.h,
      sizing: {
        type: 'contain',
        x: layout.leftCol.x,
        y: layout.leftCol.y,
        w: layout.leftCol.w,
        h: layout.leftCol.h
      }
    });
    return;
  }

  slide.addText('Photo not available', {
    x: layout.leftCol.x + 0.2,
    y: layout.leftCol.y + layout.leftCol.h / 2 - 0.15,
    w: layout.leftCol.w - 0.4,
    h: 0.3,
    align: 'center',
    fontFace: 'Aptos',
    fontSize: 14,
    color: '64748B'
  });
}

function addTextPanel(
  slide: PptxGenJS.Slide,
  area: { x: number; y: number; w: number; h: number },
  heading: string,
  content: string,
  maxChars: number
) {
  slide.addText(heading, {
    x: area.x + layout.textPad,
    y: area.y + 0.12,
    w: area.w - layout.textPad * 2,
    h: 0.28,
    fontFace: 'Aptos',
    fontSize: 12,
    bold: true,
    color: '334155'
  });

  const fitted = fitText(content || ' ', 16, maxChars);
  slide.addText(fitted.text, {
    x: area.x + layout.textPad,
    y: area.y + 0.45,
    w: area.w - layout.textPad * 2,
    h: area.h - 0.55,
    fontFace: heading.includes('japonais') ? 'Yu Gothic' : 'Aptos',
    fontSize: fitted.size,
    valign: 'top',
    color: '0F172A'
  });
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

  // 1. Ma photo et quelques mots en français
  const s1 = pptx.addSlide();
  s1.background = { color: 'F8FAFC' };
  addSlideTitle(s1, '1. Ma photo et quelques mots en français');
  addPhotoOrPlaceholder(s1, data.photoBase64);
  addTextPanel(s1, layout.rightCol, 'Texte initial (FR)', data.draftFr, 1600);

  // 2. Ma photo et je travaille mon texte en japonais
  const s2 = pptx.addSlide();
  s2.background = { color: 'F8FAFC' };
  addSlideTitle(s2, '2. Ma photo et je travaille mon texte en japonais');
  addPhotoOrPlaceholder(s2, data.photoBase64);
  addTextPanel(s2, layout.rightTop, 'Traduction automatique (JP)', data.jpAuto, 760);
  addTextPanel(s2, layout.rightBottom, 'Texte corrigé (JP)', data.jpIntent, 760);

  // 3. Mes textes en français
  const s3 = pptx.addSlide();
  s3.background = { color: 'F8FAFC' };
  addSlideTitle(s3, '3. Mes textes en français');
  addTextPanel(s3, layout.leftCol, 'Texte initial (FR)', data.draftFr, 1600);
  addTextPanel(s3, layout.rightCol, 'Texte final (FR)', data.finalFr, 1600);

  // 4. Ma photo et mon texte final en français
  const s4 = pptx.addSlide();
  s4.background = { color: 'F8FAFC' };
  addSlideTitle(s4, '4. Ma photo et mon texte final en français');
  addPhotoOrPlaceholder(s4, data.photoBase64);
  addTextPanel(s4, layout.rightCol, 'Texte final (FR)', data.finalFr, 1600);

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return buffer;
}

export function templatePath(): string {
  return path.join(process.cwd(), 'templates', 'photo-texte-template.pptx');
}
