import crypto from 'node:crypto';

import sharp from 'sharp';

export interface SanitizedPhoto {
  buffer: Buffer;
  mime: 'image/jpeg';
  size: number;
  sha256: string;
}

export async function sanitizePhoto(input: Buffer): Promise<SanitizedPhoto> {
  const buffer = await sharp(input)
    .rotate()
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    buffer,
    mime: 'image/jpeg',
    size: buffer.byteLength,
    sha256
  };
}
