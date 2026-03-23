import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { buildPptxContentDisposition, buildPptxDownloadFilename } from '@/lib/pptx/download';
import { generatePhotoTextePptx } from '@/lib/pptx/generator';

describe('pptx export privacy', () => {
  it('builds the PPTX download filename from the entry title', () => {
    expect(buildPptxDownloadFilename('Mon titre')).toBe('Mon titre.pptx');
    expect(buildPptxDownloadFilename('Bonjour / Paris: été')).toBe('Bonjour Paris été.pptx');
    expect(buildPptxContentDisposition('Bonjour / Paris: été')).toContain("filename*=UTF-8''Bonjour%20Paris%20%C3%A9t%C3%A9.pptx");
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
      slide.xml.includes('étape 5. Comparaison (photo 1)')
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
      slide.xml.includes('étape 3. Mon texte photo 1 en français')
    );
    const learningSlide = slides.find((slide) =>
      slide.xml.includes('Qu’est-ce que j’ai appris avec ce Mon titre ?')
    );

    expect(etape3Slide?.xml).toContain('<a:normAutofit/>');
    expect(etape3Slide?.xml).toContain('beaucoup de phrases utiles');
    expect(etape3Slide?.xml).not.toContain('…');

    expect(learningSlide?.xml).toContain('<a:normAutofit/>');
    expect(learningSlide?.xml).toContain('organiser mon texte avec plus de nuances');
  });
});
