/**
 * GTIN helpers. Every barcode is stored and looked up as a GTIN-14:
 * strip non-digits, left-pad to 14, validate the GS1 mod-10 check digit.
 * UPC-A (12), EAN-13 (13) and GTIN-14 for the same item all normalize to the same key.
 */

/** GS1 check digit for the digits *before* the check digit. */
export function computeCheckDigit(body: string): number {
  let sum = 0;
  // Weights alternate 3,1,3,1... starting from the rightmost body digit.
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string): boolean {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  return computeCheckDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

export type NormalizeResult = { ok: true; gtin14: string } | { ok: false; reason: 'empty' | 'length' | 'check_digit' };

export function normalizeGtin(input: string | number | null | undefined): NormalizeResult {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'empty' };
  if (digits.length > 14 || digits.length < 8) return { ok: false, reason: 'length' };
  const gtin14 = digits.padStart(14, '0');
  if (!isValidGtin(gtin14)) return { ok: false, reason: 'check_digit' };
  return { ok: true, gtin14 };
}

/** Convenience: normalized GTIN-14 or null. */
export function toGtin14(input: string | number | null | undefined): string | null {
  const r = normalizeGtin(input);
  return r.ok ? r.gtin14 : null;
}

/**
 * Lenient variant for importing source data: some source rows store an 11-digit UPC body
 * without its check digit. Only that exact case is repaired; any other invalid value is
 * rejected so a typo can never map to a different product.
 */
export function toGtin14Lenient(input: string | number | null | undefined): string | null {
  const strict = toGtin14(input);
  if (strict) return strict;
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 11) {
    const withCheck = digits + computeCheckDigit(digits);
    return toGtin14(withCheck);
  }
  return null;
}
