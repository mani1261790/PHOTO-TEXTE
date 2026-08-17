import path from "node:path";

import PptxGenJS from "pptxgenjs";

import {
  PresentationExportInput,
  PresentationPhotoInput,
  annotationColors,
  cleanLinesToBullets,
  computePhotoGrid as computeGrid,
  fitPresentationText as fitText,
  layoutAnnotatedPlacements,
  presentationLayout as layout,
} from "@/lib/exports/presentation";
import {
  CorrectionAnnotations,
  emptyCorrectionAnnotations,
  normalizeCorrectionAnnotations,
} from "@/lib/learning/annotations";

export type PptxPhotoInput = PresentationPhotoInput;
export type PptxExportInput = PresentationExportInput;

function addSlideTitle(slide: PptxGenJS.Slide, value: string) {
  slide.addText(value, {
    ...layout.title,
    fontFace: "Arial",
    fontSize: 24,
    bold: true,
    color: "0F172A",
  });
}

function addHeading(
  slide: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  value: string,
) {
  slide.addText(value, {
    x,
    y,
    w,
    h,
    fontFace: "Arial",
    fontSize: 12,
    bold: true,
    color: "334155",
  });
}

function addTextPanel(
  slide: PptxGenJS.Slide,
  area: { x: number; y: number; w: number; h: number },
  heading: string,
  content: string,
  maxChars: number,
) {
  addPhotoBox(slide, area);
  addHeading(
    slide,
    area.x + layout.textPad,
    area.y + 0.12,
    area.w - layout.textPad * 2,
    0.28,
    heading,
  );

  const fitted = fitText(content || " ", 16, maxChars);
  slide.addText(fitted.text, {
    x: area.x + layout.textPad,
    y: area.y + 0.45,
    w: area.w - layout.textPad * 2,
    h: area.h - 0.55,
    fontFace: "Arial",
    fontSize: fitted.size,
    fit: "shrink",
    valign: "top",
    color: "0F172A",
  });
}

function addPhotoBox(
  slide: PptxGenJS.Slide,
  area: { x: number; y: number; w: number; h: number },
) {
  slide.addShape("rect", {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    line: { color: "CBD5E1", pt: 1 },
    fill: { color: "F8FAFC" },
  });
}

function addPhotoOrPlaceholder(
  slide: PptxGenJS.Slide,
  area: { x: number; y: number; w: number; h: number },
  data?: string,
) {
  addPhotoBox(slide, area);

  if (!data) {
    slide.addText("Photo not available", {
      x: area.x + 0.2,
      y: area.y + area.h / 2 - 0.15,
      w: area.w - 0.4,
      h: 0.3,
      align: "center",
      fontFace: "Arial",
      fontSize: 14,
      color: "64748B",
    });
    return;
  }

  // Key requirement: no stretching. Use "contain" sizing to preserve aspect ratio.
  slide.addImage({
    data,
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    sizing: {
      type: "contain",
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
    },
  });
}

function addTitlePage(pptx: PptxGenJS, titleFr: string, displayName?: string) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };

  // Big centered title
  s.addText(titleFr?.trim() || "PHOTO-TEXTE", {
    x: 0.7,
    y: 2.6,
    w: 12,
    h: 1.2,
    align: "center",
    fontFace: "Arial",
    fontSize: 42,
    bold: true,
    color: "0F172A",
  });

  s.addText("PHOTO-TEXTE", {
    x: 0.7,
    y: 4.0,
    w: 12,
    h: 0.4,
    align: "center",
    fontFace: "Arial",
    fontSize: 14,
    color: "64748B",
  });

  const safeName = (displayName ?? "").trim();
  if (safeName) {
    s.addText(safeName, {
      x: 0.6,
      y: 6.85,
      w: 6,
      h: 0.35,
      align: "left",
      fontFace: "Arial",
      fontSize: 14,
      color: "334155",
    });
  }
}

function addPhotosGridSlide(
  pptx: PptxGenJS,
  titleFr: string,
  photos: PptxPhotoInput[],
) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };

  const n = photos.length;
  const noun = n === 1 ? "photo" : "photos";
  addSlideTitle(
    s,
    `Étape 1 : ${n} ${noun} pour ${titleFr?.trim() || "PHOTO-TEXTE"}`,
  );

  const { cols, rows } = computeGrid(n);

  const gridX = 0.6;
  const gridY = 1.25;
  const gridW = 12.2;
  const gridH = 5.95;

  const gap = 0.18;

  const cellW = (gridW - gap * (cols - 1)) / cols;
  const cellH = (gridH - gap * (rows - 1)) / rows;

  photos.forEach((p, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;

    const x = gridX + c * (cellW + gap);
    const y = gridY + r * (cellH + gap);

    // Photo
    addPhotoOrPlaceholder(s, { x, y, w: cellW, h: cellH }, p.photoBase64);

    // Caption "Photo k"
    s.addShape("rect", {
      x: x + 0.08,
      y: y + 0.08,
      w: 1.05,
      h: 0.32,
      fill: { color: "FFFFFF", transparency: 15 },
      line: { color: "CBD5E1", pt: 1 },
    });
    s.addText(`Photo ${p.position}`, {
      x: x + 0.12,
      y: y + 0.12,
      w: 0.97,
      h: 0.24,
      fontFace: "Arial",
      fontSize: 11,
      bold: true,
      color: "0F172A",
    });
  });
}

function addEtape1PhotoTextSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(
    s,
    `Étape 1. Ma photo ${photo.position} et quelques mots en français`,
  );
  addPhotoOrPlaceholder(s, layout.leftCol, photo.photoBase64);
  addTextPanel(s, layout.rightCol, "Texte initial (FR)", photo.draftFr, 1600);
}

function addEtape2JapaneseSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(s, `Étape 2. Mon texte de la photo ${photo.position} en japonais`);
  addTextPanel(
    s,
    layout.leftCol,
    "Traduction automatique (JP)",
    photo.jpAuto,
    760,
  );
  addTextPanel(s, layout.rightCol, "Texte corrigé (JP)", photo.jpIntent, 760);
}

function addEtape3FrenchSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(s, `Étape 3. Mon texte de la photo ${photo.position} en français`);
  addTextPanel(s, layout.leftCol, "Texte initial (FR)", photo.draftFr, 1600);
  addTextPanel(s, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
}

function addEtape4FinalSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(
    s,
    `Étape 4. Ma photo et mon texte final en français - photo ${photo.position}`,
  );
  addPhotoOrPlaceholder(s, layout.leftCol, photo.photoBase64);
  addTextPanel(s, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
}
function addAnnotatedTextPanel(
  slide: PptxGenJS.Slide,
  area: { x: number; y: number; w: number; h: number },
  heading: string,
  text: string,
  input: CorrectionAnnotations | undefined,
) {
  addPhotoBox(slide, area);
  addHeading(
    slide,
    area.x + layout.textPad,
    area.y + 0.12,
    area.w - layout.textPad * 2,
    0.28,
    heading,
  );

  const annotations = normalizeCorrectionAnnotations(
    input ?? emptyCorrectionAnnotations(text),
    text,
  );
  if (!annotations.highlights.length && !annotations.knownRanges.length) {
    const fitted = fitText(text, 16, 1050, 8);
    slide.addText(fitted.text, {
      x: area.x + layout.textPad,
      y: area.y + 0.45,
      w: area.w - layout.textPad * 2,
      h: area.h - 0.55,
      fontFace: "Arial",
      fontSize: fitted.size,
      fit: "shrink",
      color: "0F172A",
      valign: "top",
    });
    return;
  }

  const content = {
    x: area.x + layout.textPad,
    y: area.y + 0.5,
    w: area.w - layout.textPad * 2,
    h: area.h - 0.65,
  };
  let fontSize = fitText(text, 16, 1050, 6).size;
  let measured = layoutAnnotatedPlacements(text, annotations, content.w, fontSize);
  while (fontSize > 4.5 && measured.height > content.h) {
    fontSize -= 0.5;
    measured = layoutAnnotatedPlacements(text, annotations, content.w, fontSize);
  }

  for (const placement of measured.placements) {
    if (!placement.highlight) continue;
    slide.addShape("rect", {
      x: content.x + placement.x - 0.015,
      y: content.y + placement.y + placement.h * 0.12,
      w: placement.w + 0.03,
      h: placement.h * 0.76,
      line: { color: annotationColors[placement.highlight], transparency: 100 },
      fill: { color: annotationColors[placement.highlight] },
    });
  }

  for (let knownIndex = 0; knownIndex < annotations.knownRanges.length; knownIndex += 1) {
    const knownPlacements = measured.placements.filter(
      (placement) => placement.knownRangeIndex === knownIndex,
    );
    const lines = [...new Set(knownPlacements.map((placement) => placement.line))];
    for (const line of lines) {
      const linePlacements = knownPlacements.filter((placement) => placement.line === line);
      if (!linePlacements.length) continue;
      const first = linePlacements[0];
      const last = linePlacements[linePlacements.length - 1];
      slide.addShape("roundRect", {
        x: content.x + first.x - 0.045,
        y: content.y + first.y + 0.01,
        w: last.x + last.w - first.x + 0.09,
        h: first.h * 0.94,
        rectRadius: 0.04,
        line: { color: "334155", pt: 1.4 },
        fill: { color: "FFFFFF", transparency: 100 },
      });
    }
  }

  for (const placement of measured.placements) {
    slide.addText(placement.text, {
      x: content.x + placement.x,
      y: content.y + placement.y,
      w: placement.w + 0.03,
      h: placement.h,
      margin: 0,
      breakLine: false,
      fontFace: "Arial",
      fontSize,
      color: "0F172A",
      valign: "middle",
    });
  }
}

function addAnnotationLegend(slide: PptxGenJS.Slide) {
  const items = [
    { label: "Noms et adjectifs utiles", color: annotationColors.useful_word },
    { label: "Verbes utiles", color: annotationColors.useful_verb },
    { label: "Autres points de grammaire", color: annotationColors.grammar },
    { label: "Ce que je connais", color: null },
  ];
  const itemWidth = 2.92;
  items.forEach((item, index) => {
    const x = layout.etape5Legend.x + index * itemWidth;
    slide.addShape("roundRect", {
      x,
      y: layout.etape5Legend.y + 0.12,
      w: 0.42,
      h: 0.3,
      rectRadius: 0.04,
      line: item.color
        ? { color: item.color, transparency: 100 }
        : { color: "334155", pt: 1.4 },
      fill: item.color
        ? { color: item.color }
        : { color: "FFFFFF", transparency: 100 },
    });
    slide.addText(item.label, {
      x: x + 0.5,
      y: layout.etape5Legend.y + 0.1,
      w: itemWidth - 0.55,
      h: 0.34,
      margin: 0,
      fontFace: "Arial",
      fontSize: 10.5,
      color: "334155",
      valign: "middle",
    });
  });
}

function addEtape5ComparisonSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(s, `Étape 5. Comparaison (photo ${photo.position})`);

  const draftArea = { x: 0.6, y: 1.2, w: 5.85, h: 4.6 };
  const finalArea = { x: 6.85, y: 1.2, w: 5.85, h: 4.6 };

  addTextPanel(
    s,
    draftArea,
    "Texte initial (FR)",
    photo.draftFr,
    1050,
  );

  addAnnotatedTextPanel(
    s,
    finalArea,
    "Texte corrigé (FR)",
    photo.finalFr,
    photo.annotations,
  );

  s.addShape("roundRect", {
    x: 0.6,
    y: 6.0,
    w: 12.1,
    h: 0.78,
    line: { color: "CBD5E1", pt: 1 },
    fill: { color: "FFFFFF" },
  });
  addAnnotationLegend(s);
}

function addLearningSlide(pptx: PptxGenJS, titleFr: string, bullets: string[]) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };

  // Header (multi-line)
  const header =
    `Qu’est-ce que j’ai appris grâce au projet « ${titleFr?.trim() || "PHOTO-TEXTE"} » ?\n` +
    `Quels nouveaux mots utiles ? Quelle grammaire utile ? Etc.`;
  s.addText(header, {
    ...layout.learningHeader,
    fontFace: "Arial",
    fontSize: 22,
    bold: true,
    color: "0F172A",
  });

  if (bullets.length === 0) {
    s.addText("•", {
      ...layout.learningBody,
      fontFace: "Arial",
      fontSize: 22,
      fit: "shrink",
      color: "64748B",
      valign: "top",
    });
    return;
  }

  // Use a single text box with bullets; keep within slide.
  const learningText = bullets.map((b) => `• ${b}`).join("\n");
  const fittedLearning = fitText(learningText, 22, 1100, 11);
  s.addText(fittedLearning.text, {
    ...layout.learningBody,
    fontFace: "Arial",
    fontSize: fittedLearning.size,
    fit: "shrink",
    color: "0F172A",
    valign: "top",
  });
}

/**
 * Generates PPTX with the requested ordering:
 *
 * Title page
 * -> Grid page of N photos (étape 1 : N photos pour <title>)
 * -> For each photo 1..N: étape1 (photo + initial FR)
 * -> For each photo 1..N: étape2 (JP auto + JP intent)
 * -> For each photo 1..N: étape3 (initial FR + final FR)
 * -> For each photo 1..N: étape4 (photo + final FR)
 * -> For each photo 1..N: étape5 (comparison with color highlights)
 * -> Learning slide (SELF_NOTE bullets)
 */
export async function generatePhotoTextePptx(
  data: PptxExportInput,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "PHOTO-TEXTE App";
  pptx.subject = "Student assignment export";
  pptx.title = "PHOTO-TEXTE Export";
  pptx.company = "PHOTO-TEXTE";
  pptx.layout = "LAYOUT_WIDE";

  const titleFr = (data.titleFr ?? "").trim() || "PHOTO-TEXTE";
  const displayName = (data.displayName ?? "").trim();

  // Normalize photos and ensure deterministic order by position.
  const photos = [...(data.photos ?? [])]
    .filter((p) => p && typeof p.position === "number")
    .sort((a, b) => a.position - b.position)
    .map((p, idx) => ({
      ...p,
      position: Number.isFinite(p.position) ? p.position : idx + 1,
      draftFr: p.draftFr ?? "",
      jpAuto: p.jpAuto ?? "",
      jpIntent: p.jpIntent ?? "",
      finalFr: p.finalFr ?? "",
    }));

  // Title
  addTitlePage(pptx, titleFr, displayName);

  // Grid summary slide
  addPhotosGridSlide(pptx, titleFr, photos);

  // Step slides in the specified sequence
  for (const p of photos) addEtape1PhotoTextSlide(pptx, p);
  for (const p of photos) addEtape2JapaneseSlide(pptx, p);
  for (const p of photos) addEtape3FrenchSlide(pptx, p);
  for (const p of photos) addEtape4FinalSlide(pptx, p);
  for (const p of photos) addEtape5ComparisonSlide(pptx, p);

  // Final learning slide (SELF_NOTE)
  const bullets = cleanLinesToBullets(data.learningBullets ?? []);
  addLearningSlide(pptx, titleFr, bullets);

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

export function templatePath(): string {
  return path.join(process.cwd(), "templates", "photo-texte-template.pptx");
}
