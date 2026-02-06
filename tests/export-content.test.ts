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
      jpText: '公園を訪れます。',
      finalFr: 'Je visite calmement un parc.',
      includeMemos: true,
      memos: [
        {
          id: '1',
          entry_id: 'e1',
          user_id: 'u1',
          memo_type: 'SELF_NOTE',
          content: 'Revoir les verbes',
          created_at: new Date().toISOString()
        }
      ]
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
