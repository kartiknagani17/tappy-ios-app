import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCheckDigit, isValidGtin, normalizeGtin, toGtin14, toGtin14Lenient } from '../src/lib/gtin.ts';

describe('GTIN normalization', () => {
  it('computes GS1 check digits', () => {
    assert.equal(computeCheckDigit('03600029145'), 2); // UPC-A 036000291452
    assert.equal(computeCheckDigit('400638133393'), 1); // EAN-13 4006381333931
    assert.equal(computeCheckDigit('9638507'), 4); // EAN-8 96385074
    assert.equal(computeCheckDigit('0001234567890'), 5);
  });

  it('validates check digits for every supported length', () => {
    assert.ok(isValidGtin('036000291452'));
    assert.ok(isValidGtin('4006381333931'));
    assert.ok(isValidGtin('96385074'));
    assert.ok(isValidGtin('00036000291452'));
    assert.ok(!isValidGtin('036000291453'));
    assert.ok(!isValidGtin('12345'));
  });

  it('maps UPC-A, EAN-13 (leading zero) and GTIN-14 of one item to the same key', () => {
    const forms = ['036000291452', '0036000291452', '00036000291452', '0 36000 29145 2', '036000-291452'];
    for (const f of forms) assert.equal(toGtin14(f), '00036000291452', f);
  });

  it('pads GTIN-8 to 14 digits', () => {
    assert.equal(toGtin14('96385074'), '00000096385074');
  });

  it('rejects bad input with a reason', () => {
    assert.deepEqual(normalizeGtin(''), { ok: false, reason: 'empty' });
    assert.deepEqual(normalizeGtin('abc'), { ok: false, reason: 'empty' });
    assert.deepEqual(normalizeGtin('1234567'), { ok: false, reason: 'length' });
    assert.deepEqual(normalizeGtin('123456789012345'), { ok: false, reason: 'length' });
    assert.deepEqual(normalizeGtin('036000291453'), { ok: false, reason: 'check_digit' });
  });

  it('accepts numbers', () => {
    assert.equal(toGtin14(36000291452), '00036000291452');
  });

  it('lenient import mode repairs only an 11-digit body missing its check digit', () => {
    assert.equal(toGtin14Lenient('03600029145'), '00036000291452');
    assert.equal(toGtin14Lenient('036000291453'), null); // wrong check digit is never "repaired"
    assert.equal(toGtin14Lenient('036000291452'), '00036000291452');
  });
});
