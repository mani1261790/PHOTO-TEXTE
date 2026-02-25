import path from "node:path";

import PptxGenJS from "pptxgenjs";

export interface PptxPhotoInput {
  position: number; // 1-based
  draftFr: string;
  jpAuto: string;
  jpIntent: string;
  finalFr: string;
  /**
   * A data URL such as:
   * - data:image/jpeg;base64,...
   * - data:image/png;base64,...
   */
  photoBase64?: string;
}

export interface PptxExportInput {
  titleFr: string;
  displayName?: string;
  photos: PptxPhotoInput[];
  /**
   * SELF_NOTE memo content lines.
   * These will be rendered as bullet points on the last slide.
   */
  learningBullets?: string[];
}

/**
 * Widescreen (13.333 x 7.5 in) layout coordinates for pptxgenjs with LAYOUT_WIDE.
 */
const layout = {
  // Common
  title: { x: 0.5, y: 0.25, w: 12.3, h: 0.65 },
  textPad: 0.18,

  // Two-column slides
  leftCol: { x: 0.6, y: 1.2, w: 5.9, h: 5.8 },
  rightCol: { x: 6.8, y: 1.2, w: 5.9, h: 5.8 },
  rightTop: { x: 6.8, y: 1.2, w: 5.9, h: 2.75 },
  rightBottom: { x: 6.8, y: 4.25, w: 5.9, h: 2.75 },

  // Learning slide
  learningHeader: { x: 0.6, y: 0.25, w: 12.2, h: 0.8 },
  learningBody: { x: 1.2, y: 1.6, w: 11.4, h: 5.6 },
};

function cleanLinesToBullets(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const s = (raw ?? "").trim();
    if (!s) continue;
    // Split multi-line memo content into bullets too.
    const parts = s
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      // Strip leading bullet-ish markers
      out.push(p.replace(/^[-*•\u2022]+\s*/, ""));
    }
  }
  return out.slice(0, 18); // keep slide readable
}

function fitText(
  value: string,
  baseSize: number,
  maxChars: number,
): { text: string; size: number } {
  const clean = (value ?? "").trim();
  if (clean.length <= maxChars) {
    return { text: clean || " ", size: baseSize };
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
    fontFace: "Aptos Display",
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
    fontFace: "Aptos",
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
    fontFace:
      heading.includes("japonais") || heading.includes("(JP)")
        ? "Yu Gothic"
        : "Aptos",
    fontSize: fitted.size,
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
      fontFace: "Aptos",
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
    fontFace: "Aptos Display",
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
    fontFace: "Aptos",
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
      fontFace: "Aptos",
      fontSize: 14,
      color: "334155",
    });
  }
}

function computeGrid(n: number): { cols: number; rows: number } {
  // Ensure it fits on the slide. For up to 10:
  // 1-3: 3x1 (visually nice)
  // 4: 2x2
  // 5-6: 3x2
  // 7-9: 3x3
  // 10: 5x2
  if (n <= 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  return { cols: 5, rows: 2 };
}

function addPhotosGridSlide(
  pptx: PptxGenJS,
  titleFr: string,
  photos: PptxPhotoInput[],
) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };

  const n = photos.length;
  addSlideTitle(
    s,
    `étape 1 : ${n} photos pour ${titleFr?.trim() || "PHOTO-TEXTE"}`,
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
      fontFace: "Aptos",
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
    `étape1. Ma photo ${photo.position} et quelques mots en français`,
  );
  addPhotoOrPlaceholder(s, layout.leftCol, photo.photoBase64);
  addTextPanel(s, layout.rightCol, "Texte initial (FR)", photo.draftFr, 1600);
}

function addEtape2JapaneseSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(s, `étape 2. Mon texte photo ${photo.position} en japonais`);
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
  addSlideTitle(s, `étape 3. Mon texte photo ${photo.position} en français`);
  addTextPanel(s, layout.leftCol, "Texte initial (FR)", photo.draftFr, 1600);
  addTextPanel(s, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
}

function addEtape4FinalSlide(pptx: PptxGenJS, photo: PptxPhotoInput) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };
  addSlideTitle(
    s,
    `étape 4. Ma photo et mon texte photo ${photo.position} final en français`,
  );
  addPhotoOrPlaceholder(s, layout.leftCol, photo.photoBase64);
  addTextPanel(s, layout.rightCol, "Texte final (FR)", photo.finalFr, 1600);
}

function addLearningSlide(pptx: PptxGenJS, titleFr: string, bullets: string[]) {
  const s = pptx.addSlide();
  s.background = { color: "F8FAFC" };

  // Header (multi-line)
  const header =
    `Qu’est-ce que j’ai appris avec ce ${titleFr?.trim() || "PHOTO-TEXTE"} ?\n` +
    `Quels nouveaux mots utiles ? Quelle grammaire utile ? Etc.`;
  s.addText(header, {
    ...layout.learningHeader,
    fontFace: "Aptos Display",
    fontSize: 22,
    bold: true,
    color: "0F172A",
  });

  if (bullets.length === 0) {
    s.addText("•", {
      ...layout.learningBody,
      fontFace: "Aptos",
      fontSize: 22,
      color: "64748B",
      valign: "top",
    });
    return;
  }

  // Use a single text box with bullets; keep within slide.
  s.addText(bullets.map((b) => `• ${b}`).join("\n"), {
    ...layout.learningBody,
    fontFace: "Aptos",
    fontSize: 22,
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
      jpIntent: p.jpIntent ?? p.jpAuto ?? "",
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

  // Final learning slide (SELF_NOTE)
  const bullets = cleanLinesToBullets(data.learningBullets ?? []);
  addLearningSlide(pptx, titleFr, bullets);

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return buffer;
}

export function templatePath(): string {
  return path.join(process.cwd(), "templates", "photo-texte-template.pptx");
}
