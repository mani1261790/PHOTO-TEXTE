import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { generatePhotoTextePptx } from '@/lib/pptx/generator';

describe('pptx export privacy', () => {
  it('does not contain email or display name metadata in slides', async () => {
    const email = 'student@example.com';
    const displayName = 'Alice Example';

    const buffer = await generatePhotoTextePptx({
      titleFr: 'Mon titre',
      draftFr: 'Je visite un parc.',
      jpAuto: '公園を訪れます。',
      jpIntent: '私は落ち着いた雰囲気で公園を訪れました。',
      finalFr: 'Je visite calmement un parc.'
    });

    const zip = await JSZip.loadAsync(buffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.xml'));

    const allXml = (
      await Promise.all(xmlFiles.map((name) => zip.file(name)!.async('string')))
    ).join('\n');

    expect(allXml).not.toContain(email);
    expect(allXml).not.toContain(displayName);
  });
});
