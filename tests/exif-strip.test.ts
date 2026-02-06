import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { sanitizePhoto } from '@/lib/image/sanitize';

describe('photo sanitization', () => {
  it('strips EXIF metadata', async () => {
    const input = await sharp({
      create: {
        width: 40,
        height: 40,
        channels: 3,
        background: '#112233'
      }
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: 'Unit Test'
          }
        }
      })
      .toBuffer();

    const output = await sanitizePhoto(input);
    const metadata = await sharp(output.buffer).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(output.mime).toBe('image/jpeg');
  });
});
