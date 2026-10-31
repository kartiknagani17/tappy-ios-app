import sharp from 'sharp';

export const MAX_EDGE = 1024;

export class ImageError extends Error {
  readonly code = 'invalid_image';
}

/**
 * Decode an uploaded photo, auto-rotate it, downscale to at most 1024px on the long edge
 * and re-encode as JPEG. The app already resizes before upload; this is the server-side
 * guarantee (and strips EXIF metadata such as GPS location).
 */
export async function prepareImage(input: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch (e) {
    throw new ImageError(`Could not read image: ${(e as Error).message}`);
  }
}

/**
 * 64-bit difference hash (dHash) as 16 hex chars. Robust to re-compression, small crops and
 * lighting changes, so a repeat photo of the same package maps to (nearly) the same hash.
 */
export async function perceptualHash(image: Buffer): Promise<string> {
  const px = await sharp(image).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** Split a 16-hex-char hash into four 16-bit bands for indexed near-duplicate lookup. */
export const hashBands = (h: string) => [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12), h.slice(12, 16)] as const;
