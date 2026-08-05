import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, PDFImage, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

import {
  PresentationExportInput,
  PresentationPhotoInput,
  SLIDE_HEIGHT_IN,
  SLIDE_WIDTH_IN,
  annotationColors,
  cleanLinesToBullets,
  computePhotoGrid,
  fitPresentationText,
  layoutAnnotatedPlacements,
  presentationColors,
  presentationLayout as layout,
} from "@/lib/exports/presentation";
import { emptyCorrectionAnnotations, normalizeCorrectionAnnotations } from "@/lib/learning/annotations";

const regularFontPath = path.join(
  process.cwd(),
  "node_modules",
  "@expo-google-fonts",
  "noto-sans-jp",
  "400Regular",
  "NotoSansJP_400Regular.ttf",
);

const POINTS_PER_INCH = 72;
const PAGE_WIDTH = SLIDE_WIDTH_IN * POINTS_PER_INCH;
const PAGE_HEIGHT = SLIDE_HEIGHT_IN * POINTS_PER_INCH;

type Area = { x: number; y: number; w: number; h: number };
type PdfFonts = { regular: PDFFont; bold: PDFFont; japanese: PDFFont };

function pt(value: number): number {
  return value * POINTS_PER_INCH;
}

function color(hex: string) {
  const normalized = hex.replace(/^#/, "");
  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}

function bottom(area: Area): number {
  return PAGE_HEIGHT - pt(area.y + area.h);
}

function drawRect(
  page: PDFPage,
  area: Area,
  options: { fill?: string; border?: string; borderWidth?: number } = {},
) {
  page.drawRectangle({
    x: pt(area.x),
    y: bottom(area),
    width: pt(area.w),
    height: pt(area.h),
    color: options.fill ? color(options.fill) : undefined,
    borderColor: options.border ? color(options.border) : undefined,
    borderWidth: options.borderWidth ?? (options.border ? 1 : 0),
  });
}

function tokensForWrapping(value: string): string[] {
  return value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[^\s]+|\s+/gu) ?? [];
}

function wrapParagraph(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const token of tokensForWrapping(value)) {
    if (/^\s+$/.test(token) && !current) continue;
    const candidate = `${current}${token}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current.trimEnd());
    current = token.trimStart();
    if (font.widthOfTextAtSize(current, size) > maxWidth) {
      let fragment = "";
      for (const character of Array.from(current)) {
        if (fragment && font.widthOfTextAtSize(`${fragment}${character}`, size) > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else {
          fragment += character;
        }
      }
      current = fragment;
    }
  }
  if (current.trimEnd()) lines.push(current.trimEnd());
  return lines.length ? lines : [" "];
}

function wrapText(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  return (value || " ").split(/\r?\n/).flatMap((paragraph) =>
    wrapParagraph(paragraph, font, size, maxWidth),
  );
}

function fitWrappedText(
  value: string,
  font: PDFFont,
  baseSize: number,
  minSize: number,
  width: number,
  height: number,
) {
  let size = baseSize;
  let lines = wrapText(value, font, size, width);
  while (size > minSize && lines.length * size * 1.28 > height) {
    size -= 0.5;
    lines = wrapText(value, font, size, width);
  }
  return { size, lines, lineHeight: size * 1.28 };
}

function drawTextBlock(
  page: PDFPage,
  value: string,
  area: Area,
  options: {
    font: PDFFont;
    size: number;
    minSize?: number;
    color?: string;
    align?: "left" | "center";
  },
) {
  const width = pt(area.w);
  const height = pt(area.h);
  const fitted = fitWrappedText(
    value,
    options.font,
    options.size,
    options.minSize ?? 7,
    width,
    height,
  );
  const top = PAGE_HEIGHT - pt(area.y);
  fitted.lines.forEach((line, index) => {
    const lineWidth = options.font.widthOfTextAtSize(line, fitted.size);
    const x = options.align === "center"
      ? pt(area.x) + Math.max(0, (width - lineWidth) / 2)
      : pt(area.x);
    page.drawText(line, {
      x,
      y: top - fitted.size - index * fitted.lineHeight,
      size: fitted.size,
      font: options.font,
      color: color(options.color ?? presentationColors.ink),
    });
  });
}

function addPage(pdf: PDFDocument): PDFPage {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawRect(page, { x: 0, y: 0, w: SLIDE_WIDTH_IN, h: SLIDE_HEIGHT_IN }, {
    fill: presentationColors.background,
  });
  return page;
}

function drawSlideTitle(page: PDFPage, fonts: PdfFonts, value: string) {
  drawTextBlock(page, value, layout.title, {
    font: fonts.bold,
    size: 24,
    minSize: 16,
  });
}

function drawHeading(page: PDFPage, fonts: PdfFonts, area: Area, value: string) {
  drawTextBlock(page, value, area, {
    font: fonts.bold,
    size: 12,
    minSize: 9,
    color: presentationColors.secondaryInk,
  });
}

function drawPanel(page: PDFPage, area: Area) {
  drawRect(page, area, {
    fill: presentationColors.background,
    border: presentationColors.border,
    borderWidth: 1,
  });
}

function drawTextPanel(
  page: PDFPage,
  fonts: PdfFonts,
  area: Area,
  heading: string,
  content: string,
  maxChars: number,
) {
  drawPanel(page, area);
  drawHeading(page, fonts, {
    x: area.x + layout.textPad,
    y: area.y + 0.12,
    w: area.w - layout.textPad * 2,
    h: 0.28,
  }, heading);
  const fitted = fitPresentationText(content || " ", 16, maxChars, 7);
  const bodyFont = heading.includes("japonais") || heading.includes("(JP)")
    ? fonts.japanese
    : fonts.regular;
  drawTextBlock(page, fitted.text, {
    x: area.x + layout.textPad,
    y: area.y + 0.45,
    w: area.w - layout.textPad * 2,
    h: area.h - 0.55,
  }, {
    font: bodyFont,
    size: fitted.size,
    minSize: 5,
  });
}

async function embedPhoto(pdf: PDFDocument, data?: string): Promise<PDFImage | null> {
  if (!data) return null;
  const match = data.match(/^data:[^;]+;base64,(.+)$/s);
  if (!match) return null;
  try {
    const source = Buffer.from(match[1], "base64");
    const png = await sharp(source).png().toBuffer();
    return await pdf.embedPng(png);
  } catch {
    return null;
  }
}

async function drawPhoto(
  pdf: PDFDocument,
  page: PDFPage,
  fonts: PdfFonts,
  area: Area,
  data?: string,
) {
  drawPanel(page, area);
  const image = await embedPhoto(pdf, data);
  if (!image) {
    drawTextBlock(page, "Photo not available", {
      x: area.x + 0.2,
      y: area.y + area.h / 2 - 0.15,
      w: area.w - 0.4,
      h: 0.3,
    }, {
      font: fonts.regular,
      size: 14,
      color: presentationColors.mutedInk,
      align: "center",
    });
    return;
  }
  const fitted = image.scaleToFit(pt(area.w), pt(area.h));
  page.drawImage(image, {
    x: pt(area.x) + (pt(area.w) - fitted.width) / 2,
    y: bottom(area) + (pt(area.h) - fitted.height) / 2,
    width: fitted.width,
    height: fitted.height,
  });
}

function drawTitlePage(pdf: PDFDocument, fonts: PdfFonts, title: string, displayName: string) {
  const page = addPage(pdf);
  drawTextBlock(page, title, { x: 0.7, y: 2.6, w: 12, h: 1.2 }, {
    font: fonts.bold,
    size: 42,
    minSize: 24,
    align: "center",
  });
  drawTextBlock(page, "PHOTO-TEXTE", { x: 0.7, y: 4, w: 12, h: 0.4 }, {
    font: fonts.regular,
    size: 14,
    color: presentationColors.mutedInk,
    align: "center",
  });
  if (displayName) {
    drawTextBlock(page, displayName, { x: 0.6, y: 6.85, w: 6, h: 0.35 }, {
      font: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(displayName)
        ? fonts.japanese
        : fonts.regular,
      size: 14,
      color: presentationColors.secondaryInk,
    });
  }
}

async function drawPhotoGridPage(
  pdf: PDFDocument,
  fonts: PdfFonts,
  title: string,
  photos: PresentationPhotoInput[],
) {
  const page = addPage(pdf);
  const noun = photos.length === 1 ? "photo" : "photos";
  drawSlideTitle(page, fonts, `Étape 1 : ${photos.length} ${noun} pour ${title}`);
  const { cols, rows } = computePhotoGrid(photos.length);
  const grid = { x: 0.6, y: 1.25, w: 12.2, h: 5.95 };
  const gap = 0.18;
  const cellW = (grid.w - gap * (cols - 1)) / cols;
  const cellH = (grid.h - gap * (rows - 1)) / rows;
  for (let index = 0; index < photos.length; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const area = {
      x: grid.x + col * (cellW + gap),
      y: grid.y + row * (cellH + gap),
      w: cellW,
      h: cellH,
    };
    await drawPhoto(pdf, page, fonts, area, photos[index].photoBase64);
    drawRect(page, { x: area.x + 0.08, y: area.y + 0.08, w: 1.05, h: 0.32 }, {
      fill: presentationColors.white,
      border: presentationColors.border,
      borderWidth: 1,
    });
    drawTextBlock(page, `Photo ${photos[index].position}`, {
      x: area.x + 0.12,
      y: area.y + 0.1,
      w: 0.97,
      h: 0.24,
    }, { font: fonts.bold, size: 11, minSize: 9 });
  }
}

function drawAnnotatedTextPanel(
  page: PDFPage,
  fonts: PdfFonts,
  area: Area,
  heading: string,
  text: string,
  input: PresentationPhotoInput["annotations"],
) {
  const annotations = normalizeCorrectionAnnotations(
    input ?? emptyCorrectionAnnotations(text),
    text,
  );
  if (!annotations.highlights.length && !annotations.knownRanges.length) {
    drawTextPanel(page, fonts, area, heading, text, 1050);
    return;
  }

  drawPanel(page, area);
  drawHeading(page, fonts, {
    x: area.x + layout.textPad,
    y: area.y + 0.12,
    w: area.w - layout.textPad * 2,
    h: 0.28,
  }, heading);

  const content = {
    x: area.x + layout.textPad,
    y: area.y + 0.5,
    w: area.w - layout.textPad * 2,
    h: area.h - 0.65,
  };
  let fontSize = fitPresentationText(text, 16, 1050, 6).size;
  let measured = layoutAnnotatedPlacements(text, annotations, content.w, fontSize);
  while (fontSize > 4.5 && measured.height > content.h) {
    fontSize -= 0.5;
    measured = layoutAnnotatedPlacements(text, annotations, content.w, fontSize);
  }

  for (const placement of measured.placements) {
    if (!placement.highlight) continue;
    drawRect(page, {
      x: content.x + placement.x - 0.015,
      y: content.y + placement.y + placement.h * 0.12,
      w: placement.w + 0.03,
      h: placement.h * 0.76,
    }, { fill: annotationColors[placement.highlight] });
  }

  for (let knownIndex = 0; knownIndex < annotations.knownRanges.length; knownIndex += 1) {
    const selected = measured.placements.filter((placement) => placement.knownRangeIndex === knownIndex);
    for (const line of [...new Set(selected.map((placement) => placement.line))]) {
      const linePlacements = selected.filter((placement) => placement.line === line);
      if (!linePlacements.length) continue;
      const first = linePlacements[0];
      const last = linePlacements[linePlacements.length - 1];
      drawRect(page, {
        x: content.x + first.x - 0.045,
        y: content.y + first.y + 0.01,
        w: last.x + last.w - first.x + 0.09,
        h: first.h * 0.94,
      }, { border: presentationColors.secondaryInk, borderWidth: 1.4 });
    }
  }

  for (const placement of measured.placements) {
    page.drawText(placement.text, {
      x: pt(content.x + placement.x),
      y: PAGE_HEIGHT - pt(content.y + placement.y) - fontSize,
      size: fontSize,
      font: fonts.regular,
      color: color(presentationColors.ink),
    });
  }
}

function drawAnnotationLegend(page: PDFPage, fonts: PdfFonts) {
  const items = [
    { label: "Noms et adjectifs utiles", color: annotationColors.useful_word },
    { label: "Verbes utiles", color: annotationColors.useful_verb },
    { label: "Autres points de grammaire", color: annotationColors.grammar },
    { label: "Ce que je connais", color: null },
  ];
  items.forEach((item, index) => {
    const x = layout.etape5Legend.x + index * 2.92;
    drawRect(page, { x, y: layout.etape5Legend.y + 0.12, w: 0.42, h: 0.3 }, item.color
      ? { fill: item.color }
      : { border: presentationColors.secondaryInk, borderWidth: 1.4 });
    drawTextBlock(page, item.label, {
      x: x + 0.5,
      y: layout.etape5Legend.y + 0.08,
      w: 2.37,
      h: 0.36,
    }, {
      font: fonts.regular,
      size: 10.5,
      minSize: 8,
      color: presentationColors.secondaryInk,
    });
  });
}

async function drawPhotoSteps(pdf: PDFDocument, fonts: PdfFonts, photos: PresentationPhotoInput[]) {
  for (const photo of photos) {
    const page = addPage(pdf);
    drawSlideTitle(page, fonts, `Étape 1. Ma photo ${photo.position} et quelques mots en français`);
    await drawPhoto(pdf, page, fonts, layout.leftCol, photo.photoBase64);
    drawTextPanel(page, fonts, layout.rightCol, "Texte initial (FR)", photo.draftFr, 1600);
  }
  for (const photo of photos) {
    const page = addPage(pdf);
    drawSlideTitle(page, fonts, `Étape 2. Mon texte de la photo ${photo.position} en japonais`);
    drawTextPanel(page, fonts, layout.leftCol, "Traduction automatique (JP)", photo.jpAuto, 760);
    drawTextPanel(page, fonts, layout.rightCol, "Texte corrigé (JP)", photo.jpIntent, 760);
  }
  for (const photo of photos) {
    const page = addPage(pdf);
    drawSlideTitle(page, fonts, `Étape 3. Mon texte de la photo ${photo.position} en français`);
    drawTextPanel(page, fonts, layout.leftCol, "Texte initial (FR)", photo.draftFr, 1600);
    drawTextPanel(page, fonts, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
  }
  for (const photo of photos) {
    const page = addPage(pdf);
    drawSlideTitle(page, fonts, `Étape 4. Ma photo et mon texte final en français - photo ${photo.position}`);
    await drawPhoto(pdf, page, fonts, layout.leftCol, photo.photoBase64);
    drawTextPanel(page, fonts, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
  }
  for (const photo of photos) {
    const page = addPage(pdf);
    drawSlideTitle(page, fonts, `Étape 5. Comparaison (photo ${photo.position})`);
    const draftArea = { x: 0.6, y: 1.2, w: 5.85, h: 4.6 };
    const finalArea = { x: 6.85, y: 1.2, w: 5.85, h: 4.6 };
    drawTextPanel(page, fonts, draftArea, "Texte initial (FR)", photo.draftFr, 1050);
    drawAnnotatedTextPanel(page, fonts, finalArea, "Texte corrigé (FR)", photo.finalFr, photo.annotations);
    drawRect(page, { x: 0.6, y: 6, w: 12.1, h: 0.78 }, {
      fill: presentationColors.white,
      border: presentationColors.border,
      borderWidth: 1,
    });
    drawAnnotationLegend(page, fonts);
  }
}

function drawLearningPage(pdf: PDFDocument, fonts: PdfFonts, title: string, bullets: string[]) {
  const page = addPage(pdf);
  drawTextBlock(page,
    `Qu’est-ce que j’ai appris grâce au projet « ${title} » ?\nQuels nouveaux mots utiles ? Quelle grammaire utile ? Etc.`,
    layout.learningHeader,
    { font: fonts.bold, size: 22, minSize: 15 },
  );
  const text = bullets.length ? bullets.map((bullet) => `• ${bullet}`).join("\n") : "•";
  drawTextBlock(page, text, layout.learningBody, {
    font: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
      ? fonts.japanese
      : fonts.regular,
    size: 22,
    minSize: 8,
    color: bullets.length ? presentationColors.ink : presentationColors.mutedInk,
  });
}

export async function generatePhotoTextePdf(data: PresentationExportInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const japaneseBytes = await readFile(regularFontPath);
  const fonts: PdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    japanese: await pdf.embedFont(japaneseBytes),
  };
  pdf.setAuthor("PHOTO-TEXTE App");
  pdf.setSubject("Student assignment export");
  pdf.setTitle("PHOTO-TEXTE Export");
  pdf.setCreator("PHOTO-TEXTE App");

  const title = data.titleFr?.trim() || "PHOTO-TEXTE";
  const displayName = data.displayName?.trim() || "";
  const photos = [...(data.photos ?? [])]
    .filter((photo) => photo && typeof photo.position === "number")
    .sort((a, b) => a.position - b.position)
    .map((photo, index) => ({
      ...photo,
      position: Number.isFinite(photo.position) ? photo.position : index + 1,
      draftFr: photo.draftFr ?? "",
      jpAuto: photo.jpAuto ?? "",
      jpIntent: photo.jpIntent ?? "",
      finalFr: photo.finalFr ?? "",
    }));

  drawTitlePage(pdf, fonts, title, displayName);
  await drawPhotoGridPage(pdf, fonts, title, photos);
  await drawPhotoSteps(pdf, fonts, photos);
  drawLearningPage(pdf, fonts, title, cleanLinesToBullets(data.learningBullets ?? []));

  return Buffer.from(await pdf.save());
}
