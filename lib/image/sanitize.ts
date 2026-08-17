export interface SanitizedPhoto {
  buffer: Buffer;
  mime: 'image/jpeg';
  size: number;
  sha256: string;
}

function stripJpegMetadata(input: Buffer): Buffer {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new Error('Only JPEG photos are accepted');
  }

  const chunks: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;

  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new Error('Invalid JPEG marker');
    const markerStart = offset;
    while (offset < input.length && input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;

    if (marker === 0xda) {
      if (offset + 2 > input.length) throw new Error('Invalid JPEG scan');
      chunks.push(input.subarray(markerStart));
      return Buffer.concat(chunks);
    }

    if (marker === 0xd9) {
      chunks.push(input.subarray(markerStart, offset));
      return Buffer.concat(chunks);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(input.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > input.length) throw new Error('Invalid JPEG segment');
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) throw new Error('Invalid JPEG segment length');
    const segmentEnd = offset + length;
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) chunks.push(input.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }

  throw new Error('JPEG scan data is missing');
}

export async function sanitizePhoto(input: Buffer): Promise<SanitizedPhoto> {
  const buffer = stripJpegMetadata(input);
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(buffer));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return {
    buffer,
    mime: 'image/jpeg',
    size: buffer.byteLength,
    sha256
  };
}
