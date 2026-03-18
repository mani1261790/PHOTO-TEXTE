import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { generatePhotoTextePptx } from '@/lib/pptx/generator';

describe('pptx export privacy', () => {
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
});
