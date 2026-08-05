import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildExportContentDisposition, buildExportDownloadFilename } from '@/lib/exports/download';
import { emptyCorrectionAnnotations } from '@/lib/learning/annotations';
import { generatePhotoTextePdf } from '@/lib/pdf/generator';
import { generatePhotoTextePptx } from '@/lib/pptx/generator';

describe('pptx export privacy', () => {
  it('builds the PPTX download filename from the entry title', () => {
    expect(buildExportDownloadFilename('Mon titre', 'pptx')).toBe('Mon titre.pptx');
    expect(buildExportDownloadFilename('Mon titre', 'pdf')).toBe('Mon titre.pdf');
    expect(buildExportDownloadFilename('Bonjour / Paris: été', 'pptx')).toBe('Bonjour Paris été.pptx');
    expect(buildExportContentDisposition('Bonjour / Paris: été', 'pdf')).toContain("filename*=UTF-8''Bonjour%20Paris%20%C3%A9t%C3%A9.pdf");
  });

  it('does not contain email or display name metadata in slides', async () => {
    const email = 'student@example.com';
    const displayName = 'Alice Example';

    const buffer = await generatePhotoTextePptx({
      titleFr: 'Mon titre',
      displayName,
      photos: [
        {
          position: 1,
          draftFr: 'Je visite un parc.',
          jpAuto: '公園を訪れます。',
          jpIntent: '私は落ち着いた雰囲気で公園を訪れました。',
          finalFr: 'Je visite calmement un parc.'
        }
      ]
    });

    const zip = await JSZip.loadAsync(buffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.xml'));

    const allXml = (
      await Promise.all(xmlFiles.map((name) => zip.file(name)!.async('string')))
    ).join('\n');

    expect(allXml).not.toContain(email);
    expect(allXml).toContain(displayName);
  });

  it('renders étape 5 as a comparison slide with draft and final text', async () => {
    const buffer = await generatePhotoTextePptx({
      titleFr: 'Mon titre',
      photos: [
        {
          position: 1,
          draftFr: 'Je visite un parc.',
          jpAuto: '公園を訪れます。',
          jpIntent: '私は落ち着いた雰囲気で公園を訪れました。',
          finalFr: 'Je visite calmement un parc.',
        },
      ],
    });

    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files).filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
    const slides = await Promise.all(
      slideNames.map(async (name) => ({
        name,
        xml: await zip.file(name)!.async('string'),
      })),
    );

    const etape5Slide = slides.find((slide) =>
      slide.xml.includes('Étape 5. Comparaison (photo 1)')
    );

    expect(etape5Slide?.xml).toContain('Texte initial (FR)');
    expect(etape5Slide?.xml).toContain('Texte corrigé (FR)');
    expect(etape5Slide?.xml).toContain('Je visite un parc.');
    expect(etape5Slide?.xml).toContain('Je');
    expect(etape5Slide?.xml).toContain('visite');
    expect(etape5Slide?.xml).toContain('calmement');
    expect(etape5Slide?.xml).toContain('parc.');
  });

  it('enables text autofit for long PPTX body content without truncating the text', async () => {
    const longFinal = 'Je raconte en detail cette photo avec beaucoup de phrases utiles et de vocabulaire. '.repeat(40).trim();
    const longBullet = 'Je retiens une formulation plus precise pour decrire une scene et organiser mon texte avec plus de nuances. '.repeat(16).trim();

    const buffer = await generatePhotoTextePptx({
      titleFr: 'Mon titre',
      photos: [
        {
          position: 1,
          draftFr: longFinal,
          jpAuto: '自動翻訳です。',
          jpIntent: '意図を整えた日本語です。',
          finalFr: longFinal,
        },
      ],
      learningBullets: [longBullet],
    });

    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files).filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
    const slides = await Promise.all(
      slideNames.map(async (name) => ({
        name,
        xml: await zip.file(name)!.async('string'),
      })),
    );

    const etape3Slide = slides.find((slide) =>
      slide.xml.includes('Étape 3. Mon texte de la photo 1 en français')
    );
    const learningSlide = slides.find((slide) =>
      slide.xml.includes('Qu’est-ce que j’ai appris grâce au projet « Mon titre » ?')
    );

    expect(etape3Slide?.xml).toContain('<a:normAutofit/>');
    expect(etape3Slide?.xml).toContain('beaucoup de phrases utiles');
    expect(etape3Slide?.xml).not.toContain('…');

    expect(learningSlide?.xml).toContain('<a:normAutofit/>');
    expect(learningSlide?.xml).toContain('organiser mon texte avec plus de nuances');
  });

  it('exports the new manual colors and an independent known-range box', async () => {
    const finalFr = 'Je visite calmement un parc.';
    const annotations = emptyCorrectionAnnotations(finalFr);
    annotations.highlights = [
      { start: finalFr.indexOf('visite'), end: finalFr.indexOf('visite') + 'visite'.length, kind: 'useful_verb' },
      { start: finalFr.indexOf('parc'), end: finalFr.indexOf('parc') + 'parc'.length, kind: 'useful_word' },
      { start: finalFr.indexOf('calmement'), end: finalFr.indexOf('calmement') + 'calmement'.length, kind: 'grammar' },
    ];
    annotations.knownRanges = [{ start: 0, end: finalFr.indexOf('calmement') + 'calmement'.length }];

    const buffer = await generatePhotoTextePptx({
      titleFr: 'Mon titre',
      photos: [{
        position: 1,
        draftFr: 'Je visite un parc.',
        jpAuto: '私は公園を訪れます。',
        jpIntent: '私は静かに公園を訪れます。',
        finalFr,
        annotations,
      }],
    });

    const zip = await JSZip.loadAsync(buffer);
    const slideXml = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
          .map((name) => zip.file(name)!.async('string')),
      )
    ).join('\n');

    expect(slideXml).toContain('BBF7D0');
    expect(slideXml).toContain('FED7AA');
    expect(slideXml).toContain('FEF08A');
    expect(slideXml).toContain('Noms et adjectifs utiles');
    expect(slideXml).toContain('Ce que je connais');
    expect(slideXml).not.toContain('F8BBD0');
    expect(slideXml).not.toContain('B2EBF2');
  });

  it('generates PDF pages with the same 16:9 size and page count as the PPTX', async () => {
    const input = {
      titleFr: 'Mon titre',
      displayName: 'Alice',
      photos: [{
        position: 1,
        draftFr: 'Je visite un parc.',
        jpAuto: '私は公園を訪れます。',
        jpIntent: '私は静かに公園を訪れます。',
        finalFr: 'Je visite calmement un parc.',
      }],
      learningBullets: ['J’ai appris une expression utile.'],
    };

    const [pptxBuffer, pdfBuffer] = await Promise.all([
      generatePhotoTextePptx(input),
      generatePhotoTextePdf(input),
    ]);
    const pptxZip = await JSZip.loadAsync(pptxBuffer);
    const pptxSlideCount = Object.keys(pptxZip.files).filter(
      (name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'),
    ).length;
    const pdf = await PDFDocument.load(pdfBuffer);

    expect(pdf.getPageCount()).toBe(pptxSlideCount);
    expect(pdf.getPageCount()).toBe(8);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(13.333 * 72, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(7.5 * 72, 1);
    expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
  }, 20_000);
});
